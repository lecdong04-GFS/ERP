import * as fs from 'fs';
import {
  parseOrderSheetBom,
  buildAuditMap,
  normName,
  inferBomUnit,
  inferMenuKind,
  getOrderSheetFilePath,
  getAuditFilePath,
  readWorkbookFromFile,
  type BomMaterial,
} from './canonical';

/** 메모성 메뉴: 품목으로 만들지 않고 목록만 보고 (집계메모/작업메모/삭제됨) */
export const MEMO_MENU_PATTERN = /전체물량|전처리실|밥비닐|삭제/;

function cleanSupplier(header: string): string {
  return header
    .replace(/\(.*?\)/g, '')
    .replace(/월화수목금토|월수금|화목토|매일|D-\d|D\d|수시|주\d/g, '')
    .trim();
}

export interface BomImportPreview {
  materialCount: number;
  menuCount: number;
  linkCount: number;
  existingMaterials: number;
  newMaterials: number;
  existingMenus: number;
  newMenus: number;
  skippedMemo: string[];
  sampleNewMaterials: string[];
  sampleNewMenus: string[];
  sampleLinks: { menu: string; materials: string[] }[];
}

export interface BomImportResult {
  menuCount: number;
  createdProducts: number;
  createdPartners: number;
  createdHeaders: number;
  createdDetails: number;
  skippedMemo: string[];
  errors: string[];
}

interface ParsedBundle {
  mats: BomMaterial[];
  menuMap: Map<string, { menu: string; links: { mat: BomMaterial; perUnit: number }[] }>;
  skippedMemo: string[];
  auditMap: Map<string, any>;
  today: string;
}

export async function loadBomBundle(orderFile: string | null, auditFile: string | null, today: string): Promise<ParsedBundle> {
  let auditMap = new Map<string, any>();
  if (auditFile && fs.existsSync(auditFile)) {
    try {
      auditMap = buildAuditMap(readWorkbookFromFile(auditFile));
    } catch {}
  }
  if (!orderFile || !fs.existsSync(orderFile)) {
    throw new Error('발주서 정본 파일을 찾을 수 없습니다.');
  }
  const wb = readWorkbookFromFile(orderFile);
  const mats = parseOrderSheetBom(wb);
  void today;

  const menuMap = new Map<string, { menu: string; links: { mat: BomMaterial; perUnit: number }[] }>();
  const skippedMemo: string[] = [];
  for (const m of mats) {
    for (const link of m.menus) {
      if (!link.menu || link.perUnit <= 0) continue;
      if (MEMO_MENU_PATTERN.test(link.menu)) {
        if (!skippedMemo.includes(link.menu)) skippedMemo.push(link.menu);
        continue;
      }
      const e = menuMap.get(link.normMenu) || { menu: link.menu, links: [] };
      e.links.push({ mat: m, perUnit: link.perUnit });
      menuMap.set(link.normMenu, e);
    }
  }
  return { mats, menuMap, skippedMemo, auditMap, today };
}

export function findRepoFiles(): { orderFile: string | null; auditFile: string | null } {
  return {
    orderFile: getOrderSheetFilePath(),
    auditFile: getAuditFilePath(),
  };
}

export type PrismaLike = {
  product: {
    findMany: (args: any) => Promise<any[]>;
    findUnique: (args: any) => Promise<any>;
    create: (args: any) => Promise<any>;
  };
  partner: {
    findFirst: (args: any) => Promise<any>;
    create: (args: any) => Promise<any>;
    count: (args?: any) => Promise<number>;
  };
  productPrice: { create: (args: any) => Promise<any> };
  bomHeader: {
    findFirst: (args: any) => Promise<any>;
    create: (args: any) => Promise<any>;
  };
  bomDetail: {
    deleteMany: (args: any) => Promise<any>;
    create: (args: any) => Promise<any>;
  };
  systemLog: { create: (args: any) => Promise<any> };
};

export function buildPreview(
  mats: BomMaterial[],
  menuMap: ParsedBundle['menuMap'],
  skippedMemo: string[],
  existingByName: Map<string, any>
): BomImportPreview {
  const newMaterials = mats.filter((m) => !existingByName.has(m.name));
  const menus = [...menuMap.values()];
  const newMenus = menus.filter((e) => !existingByName.has(e.menu));
  return {
    materialCount: mats.length,
    menuCount: menus.length,
    linkCount: menus.reduce((a, e) => a + e.links.length, 0),
    existingMaterials: mats.length - newMaterials.length,
    newMaterials: newMaterials.length,
    existingMenus: menus.length - newMenus.length,
    newMenus: newMenus.length,
    skippedMemo,
    sampleNewMaterials: newMaterials.slice(0, 10).map((m) => m.name),
    sampleNewMenus: newMenus.slice(0, 10).map((e) => e.menu),
    sampleLinks: menus.slice(0, 5).map((e) => ({
      menu: e.menu,
      materials: e.links.slice(0, 5).map((l) => `${l.mat.name} x${l.perUnit}`),
    })),
  };
}

export async function executeImport(
  db: PrismaLike,
  bundle: ParsedBundle,
  existingByName: Map<string, any>,
  today: string,
  onProgress?: (done: number, total: number, label: string) => void
): Promise<BomImportResult> {
  const { mats, menuMap, skippedMemo, auditMap } = bundle;
  let createdProducts = 0;
  let createdPartners = 0;
  let createdHeaders = 0;
  let createdDetails = 0;
  const errors: string[] = [];
  let pSeq = 0;
  let vSeq = 0;
  const dateTag = today.replace(/-/g, '');

  const ensurePartner = async (rawName: string): Promise<{ id: string; name: string } | null> => {
    const name = cleanSupplier(rawName).split('(')[0].trim();
    if (!name) return null;
    const found = await db.partner.findFirst({ where: { name } });
    if (found) return { id: found.id, name: found.name };
    vSeq += 1;
    const id = `VG${dateTag.slice(2)}${String(vSeq).padStart(3, '0')}`;
    const created = await db.partner.create({
      data: { id, name, partnerType: 'P', remark: 'BOM 일괄적재 자동생성' },
    });
    createdPartners += 1;
    return { id: created.id, name: created.name };
  };

  const productCache = new Map<string, any>(existingByName);

  const ensureMaterial = async (m: BomMaterial): Promise<any> => {
    const hit = productCache.get(m.name);
    if (hit) return hit;
    const ref: any = (auditMap as Map<string, any>).get(normName(m.name));
    const vendorRaw = ref?.vendor || (m as any).supplierHeader;
    const partner = vendorRaw ? await ensurePartner(vendorRaw) : null;
    const isSub = ref?.warehouse === '부자재';
    pSeq += 1;
    let codeBase =
      ref?.itemId && String(ref.itemId).trim() ? String(ref.itemId).trim() : `GFS-${dateTag}-${String(pSeq).padStart(3, '0')}`;
    let productCode = codeBase;
    let n = 1;
    while (await db.product.findUnique({ where: { productCode } })) {
      productCode = `${codeBase}-${n++}`;
    }
    const bagPrice = Number(ref?.bagPrice) || 0;
    const packForSafety = Number(ref?.packUnit) || 0;
    const leadM = /D-(\d+)/.exec((m as any).supplierHeader || '');
    const leadDays = leadM ? Math.max(1, parseInt(leadM[1], 10)) : 2;
    const autoSafety =
      (m as any).dailyUsage > 0 && packForSafety > 0 ? Math.round((m as any).dailyUsage * packForSafety * leadDays * 1.5) : 0;
    const created = await db.product.create({
      data: {
        productCode,
        name: m.name,
        spec: '',
        unit: 'box',
        category: isSub ? '부자재' : '원재료',
        kind: '',
        boxQty: Number(ref?.packUnit) || 0,
        warehouse: ref?.warehouse || '',
        safetyStockQty: autoSafety,
        partnerId: partner?.id || null,
        remark: 'BOM 일괄적재 자동생성(확인필요)',
      },
    });
    if (bagPrice > 0) {
      await db.productPrice.create({
        data: {
          productId: created.id,
          purchasePrice: bagPrice,
          deliveryPrice: 0,
          effectiveDate: today,
          remark: 'BOM 일괄적재 단가(봉단가)',
        },
      });
    }
    createdProducts += 1;
    productCache.set(m.name, created);
    return created;
  };

  const ensureMenu = async (menu: string): Promise<any> => {
    const hit = productCache.get(menu);
    if (hit) return hit;
    pSeq += 1;
    let productCode = `FG-${dateTag.slice(2)}-${String(pSeq).padStart(3, '0')}`;
    let n = 1;
    while (await db.product.findUnique({ where: { productCode } })) {
      productCode = `${productCode}-${n++}`;
    }
    const created = await db.product.create({
      data: {
        productCode,
        name: menu,
        spec: '',
        unit: 'ea',
        category: '완성품',
        kind: inferMenuKind(menu),
        boxQty: 1,
        remark: 'BOM 일괄적재 자동생성(신메뉴, v1.0)',
      },
    });
    createdProducts += 1;
    productCache.set(menu, created);
    return created;
  };

  const sortedMenus = [...menuMap.values()].sort((a, b) => a.menu.localeCompare(b.menu, 'ko'));
  let done = 0;
  for (const entry of sortedMenus) {
    try {
      const parent = await ensureMenu(entry.menu);
      let header = await db.bomHeader.findFirst({
        where: { parentProductId: parent.id, version: '1.0' },
      });
      if (!header) {
        header = await db.bomHeader.create({
          data: { parentProductId: parent.id, version: '1.0', effectiveDate: today, remark: 'BOM 일괄적재' },
        });
        createdHeaders += 1;
      }
      await db.bomDetail.deleteMany({ where: { bomHeaderId: header.id } });
      let sortOrder = 0;
      for (const link of entry.links) {
        const child = await ensureMaterial(link.mat);
        await db.bomDetail.create({
          data: {
            bomHeaderId: header.id,
            childProductId: child.id,
            level: 3,
            unitQty: link.perUnit,
            unit: inferBomUnit(link.mat.name),
            yieldRate: 100,
            sortOrder: ++sortOrder,
            remark: 'GFS 일괄적재',
          },
        });
        createdDetails += 1;
      }
    } catch (e: any) {
      errors.push(`${entry.menu}: ${e.message}`);
    }
    done += 1;
    onProgress?.(done, sortedMenus.length, entry.menu);
  }

  return { menuCount: sortedMenus.length, createdProducts, createdPartners, createdHeaders, createdDetails, skippedMemo, errors };
}
