/*
 * GFS ↔ ERP 브릿지 v2 (Zero-Upload Auto-Boot & 신메뉴 발주서 영구 연동)
 * - 화면 진입 즉시: (1) 최신 발주서 마스터(신메뉴·BOM) + (2) 오전 10시 주문서 + (3) 전일 오후 5시 재고표 자동 결합 산출
 * - 1~2주 주기 신메뉴 발주서 업로드 시 DB 영구 기억 및 미등록 신메뉴 BOM 자동 감지
 */
(function () {
  'use strict';

  function normName(s) {
    return String(s == null ? '' : s).replace(/\s+/g, '');
  }

  function safeGet(fn, fallback) {
    try {
      var v = fn();
      return v === undefined ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function sendBack(source, origin, payload) {
    try {
      var target = source || (window.parent !== window ? window.parent : null);
      var targetOrigin = origin || window.location.origin;
      if (target) target.postMessage(payload, targetOrigin);
    } catch (e) { /* ignore */ }
  }

  function showBadge(badgeId, labelId, text) {
    try {
      var b = document.getElementById(badgeId);
      if (b) {
        b.classList.remove('hidden');
        b.classList.add('flex');
      }
      var l = labelId && document.getElementById(labelId);
      if (l) l.textContent = text;
    } catch (e) { /* ignore */ }
  }

  function toast(msg, kind) {
    try {
      if (typeof showToast === 'function') showToast(msg, kind || 'info');
    } catch (e) { /* ignore */ }
  }

  function cleanOf(fnName, v) {
    return safeGet(function () {
      if (typeof window[fnName] !== 'function') return '';
      return window[fnName](v) || '';
    }, '');
  }

  function base64ToArrayBuffer(b64) {
    var clean = String(b64 || '').replace(/^data:[^;]+;base64,/, '').trim();
    var binaryString = atob(clean);
    var len = binaryString.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  function arrayBufferToBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var chunkSize = 0x8000;
    var binary = '';
    for (var i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  // 완제품 주문 목록 중 현재 발주서(BOM)에 매칭되지 않는 신메뉴 감지
  function detectUnmatchedMenus(orders) {
    if (typeof state === 'undefined' || !state || !Array.isArray(state.rawItems)) return [];
    var matchedMenuNorms = {};
    var aliasMap = (typeof FINISHED_GOODS_ALIAS_MAP !== 'undefined' && FINISHED_GOODS_ALIAS_MAP) ? FINISHED_GOODS_ALIAS_MAP : {};

    // 발주서 내 모든 BOM 자식 메뉴명 및 보조시트 메뉴명 수집
    var bomNormList = [];
    state.rawItems.forEach(function (item) {
      (item.bomChildren || []).forEach(function (child) {
        var rawMenu = String(child.menuName || '').trim();
        if (!rawMenu) return;
        var norm = normName(rawMenu);
        bomNormList.push(norm);
        var alias = aliasMap[rawMenu] || aliasMap[norm];
        if (alias) bomNormList.push(normName(alias));
      });
    });

    if (state.supplementaryMaterialsMap && typeof state.supplementaryMaterialsMap === 'object') {
      Object.keys(state.supplementaryMaterialsMap).forEach(function (k) {
        bomNormList.push(normName(k));
      });
    }

    var unmatched = [];
    (orders || []).forEach(function (o) {
      var name = String(o.menuName || '').trim();
      var qty = Number(o.orderQty || o.qty || 0);
      if (!name || !(qty > 0)) return;
      var k = normName(name);
      var cleanK = k.replace(/[\[\]\(\)]/g, '').replace(/더큰|NEW|직화|혜자|슈퍼|필름|용기|종가|커플/g, '');
      var found = false;

      for (var i = 0; i < bomNormList.length; i++) {
        var bn = bomNormList[i];
        if (bn === k) {
          found = true;
          break;
        }
        var stripped = bn.replace(/[\[\]\(\)]/g, '').replace(/더큰|NEW|직화|혜자|슈퍼|필름|용기|종가|커플/g, '');
        if (cleanK && stripped && cleanK.length >= 3 && stripped.length >= 3 && (cleanK.includes(stripped) || stripped.includes(cleanK))) {
          found = true;
          break;
        }
      }
      if (!found && !matchedMenuNorms[k]) {
        matchedMenuNorms[k] = true;
        unmatched.push({ menuName: name, qty: qty });
      }
    });

    return unmatched;
  }

  // 1) 발주서 마스터(Base64) 로드 및 즉시 대시보드 전환
  async function loadMasterFromBase64(b64, fileName) {
    if (typeof XLSX === 'undefined' || typeof executeDualProcurement !== 'function') {
      throw new Error('GFS 엔진 스크립트가 아직 준비되지 않았습니다.');
    }
    var buffer = base64ToArrayBuffer(b64);
    var wb = XLSX.read(buffer, { type: 'array', cellDates: true, cellFormula: true });
    state.uploadedFileBuffer = buffer;
    state.pendingMaster = {
      name: fileName || 'GFS_발주서_마스터.xlsx',
      buffer: buffer,
      workbook: wb,
    };
    await executeDualProcurement(wb, null, fileName || 'GFS_발주서_마스터.xlsx', '');
    return {
      itemCount: Array.isArray(state.rawItems) ? state.rawItems.length : 0,
      fileName: fileName || 'GFS_발주서_마스터.xlsx',
    };
  }

  // 2) 오전 10시 완제품 수주 반영
  function applyOrders(items, source, origin, labelDate) {
    if (typeof state === 'undefined' || !state) {
      sendBack(source, origin, { type: 'GFS_ORDERS_APPLIED', success: false, error: 'GFS state 없음' });
      return { success: false, count: 0, totalQty: 0, unmatchedMenus: [] };
    }
    var orders = [];
    var total = 0;
    (items || []).forEach(function (it) {
      var name = String((it && (it.menuName || it.name)) || '').trim();
      var qty = Number((it && (it.qty != null ? it.qty : it.orderQty)) || 0) || 0;
      if (!name || !(qty > 0)) return;
      orders.push({ menuName: name, orderQty: qty });
      total += qty;
    });
    state.vegetableOrders = orders;
    state.vegetableOrdersMap = {};
    state.totalFinishedGoodsQty = total;
    orders.forEach(function (o) {
      state.vegetableOrdersMap[normName(o.menuName)] = o.orderQty;
    });
    state.ordersFileName = labelDate ? ('10시수주(' + labelDate + ')') : 'ERP연동';
    try {
      if (typeof applyFinishedGoodsOrdersToMaterials === 'function') applyFinishedGoodsOrdersToMaterials();
      if (typeof renderVegetableOrdersBanner === 'function') renderVegetableOrdersBanner();
      if (typeof recalculateAll === 'function') recalculateAll();
      if (typeof updateDockIntelligence === 'function') updateDockIntelligence();
    } catch (e) {
      sendBack(source, origin, { type: 'GFS_ORDERS_APPLIED', success: false, error: String((e && e.message) || e) });
      return { success: false, count: 0, totalQty: 0, unmatchedMenus: [] };
    }
    var related = safeGet(function () {
      return (state.rawItems || []).filter(function (m) { return m.isRelatedToOrders; }).length;
    }, -1);
    var unmatchedMenus = detectUnmatchedMenus(orders);
    showBadge('ordersLoadedBadge', 'loadedOrdersFileName', (labelDate ? labelDate + ' ' : '') + '수주 ' + orders.length + '종');
    var result = {
      type: 'GFS_ORDERS_APPLIED',
      success: true,
      count: orders.length,
      totalQty: total,
      relatedItems: related,
      unmatchedMenus: unmatchedMenus,
    };
    sendBack(source, origin, result);
    return result;
  }

  // 3) 전일 오후 5시 재고조사표 + 1개월 추정일사용량 반영
  function applyAudit(items, source, origin, labelDate) {
    if (typeof state === 'undefined' || !state) {
      sendBack(source, origin, { type: 'GFS_AUDIT_APPLIED', success: false, error: 'GFS state 없음' });
      return { success: false, matched: 0, discrepancy: 0 };
    }
    if (typeof applyInventoryAuditToRawItems !== 'function') {
      sendBack(source, origin, { type: 'GFS_AUDIT_APPLIED', success: false, error: '감사 반영 함수 없음' });
      return { success: false, matched: 0, discrepancy: 0 };
    }
    var auditMap = {};
    (items || []).forEach(function (it) {
      var name = String((it && (it.name || it.productName)) || '').trim();
      if (!name) return;
      var rec = {
        id: it.id != null ? String(it.id) : '',
        name: name,
        cleanName: cleanOf('cleanAuditItemName', name),
        cleanFull: cleanOf('cleanFull', name),
        cleanPure: cleanOf('cleanPure', name),
        cleanCore: cleanOf('cleanCore', name),
        box: Number(it.box) || 0,
        piece: Number(it.piece) || 0,
        currentStock: Number(it.currentStock) || 0,
        packQty: Number(it.packQty) || 1,
        unitPrice: Number(it.unitPrice) || 0,
        dailyUsage: Number(it.dailyUsage) || 0,
        estDailyUsage: Number(it.estDailyUsage) || 0,
        sheet: it.sheet || it.warehouse || '',
        rowIndex: -1,
      };
      auditMap['name_' + name] = rec;
      if (rec.cleanFull) auditMap['cf_' + rec.cleanFull] = rec;
      if (rec.cleanPure) auditMap['cp_' + rec.cleanPure] = rec;
      if (rec.cleanCore) auditMap['cc_' + rec.cleanCore] = rec;
      if (rec.cleanName) auditMap['ca_' + rec.cleanName] = rec;
    });

    var res = { matchedCount: 0, discrepancyCount: 0 };
    var tag = labelDate ? ('실사재고(' + labelDate + ')') : 'ERP연동';
    try {
      res = applyInventoryAuditToRawItems(auditMap, tag) || res;

      // BOM으로 일사용량이 잡히지 않는 공통소모품/부자재에 추정일사용량(estDailyUsage) 보조 연동
      if (Array.isArray(state.rawItems)) {
        state.rawItems.forEach(function (item) {
          var rawName = item.name;
          var cleanF = cleanOf('cleanFull', rawName);
          var cleanP = cleanOf('cleanPure', rawName);
          var cleanC = cleanOf('cleanCore', rawName);
          var cleanA = cleanOf('cleanAuditItemName', rawName);
          var m = auditMap['name_' + rawName] || auditMap['cf_' + cleanF] || auditMap['cp_' + cleanP] || auditMap['cc_' + cleanC] || auditMap['ca_' + cleanA];
          if (m && m.estDailyUsage > 0) {
            item.estDailyUsage = m.estDailyUsage;
          }
        });
      }

      if (typeof recalculateAll === 'function') recalculateAll();
    } catch (e) {
      sendBack(source, origin, { type: 'GFS_AUDIT_APPLIED', success: false, error: String((e && e.message) || e) });
      return { success: false, matched: 0, discrepancy: 0 };
    }
    showBadge('auditLoadedBadge', 'loadedAuditFileName', tag + ' ' + (res.matchedCount || 0) + '건');
    var out = {
      type: 'GFS_AUDIT_APPLIED',
      success: true,
      matched: res.matchedCount || 0,
      discrepancy: res.discrepancyCount || 0,
    };
    sendBack(source, origin, out);
    return out;
  }

  // 4) Zero-Upload 통합 자동 부팅 실행
  async function handleAutoBoot(data, source, origin) {
    try {
      var masterInfo = (data && data.master) || {};
      var ordersInfo = (data && data.orders) || {};
      var stockInfo = (data && data.stock) || {};

      // Step 1: 발주서 마스터 로드 (DB에 저장된 최신 신메뉴 발주서 우선, 없으면 내장 GFS.xlsx)
      var masterB64 = masterInfo.base64 || (typeof window !== 'undefined' ? window.EMBEDDED_GFS_BASE64 : null);
      var masterFileName = masterInfo.fileName || 'GFS.xlsx (기본 마스터)';

      if (masterB64) {
        await loadMasterFromBase64(masterB64, masterFileName);
      } else if (!state.rawItems || state.rawItems.length === 0) {
        if (typeof loadAccurateRealisticSampleData === 'function') {
          await loadAccurateRealisticSampleData();
        }
      }

      // 업로드 섹션 확실히 숨기고 관제 대시보드/엑셀뷰 바로 노출
      var uploadSec = document.getElementById('uploadSection');
      if (uploadSec) uploadSec.classList.add('hidden');
      var ctrlPanel = document.getElementById('controlPanel');
      if (ctrlPanel) ctrlPanel.classList.remove('hidden');
      var tabsSec = document.getElementById('tabsSection');
      if (tabsSec) tabsSec.classList.remove('hidden');

      // Step 2: 오전 10시 주문서 자동 반영
      var orderRes = { count: 0, totalQty: 0, relatedItems: 0, unmatchedMenus: [] };
      if (Array.isArray(ordersInfo.items) && ordersInfo.items.length > 0) {
        orderRes = applyOrders(ordersInfo.items, null, null, ordersInfo.usedDate);
      }

      // Step 3: 전일 오후 5시 재고조사표 자동 반영
      var auditRes = { matched: 0, discrepancy: 0 };
      if (Array.isArray(stockInfo.items) && stockInfo.items.length > 0) {
        auditRes = applyAudit(stockInfo.items, null, null, stockInfo.usedDate);
      }

      if (typeof recalculateAll === 'function') recalculateAll();

      // 발주 대상 건수 및 총액 요약 계산
      var orderableCount = 0;
      var totalBoxes = 0;
      var totalAmount = 0;
      if (Array.isArray(state.rawItems)) {
        state.rawItems.forEach(function (m) {
          var boxes = Number((m.calc && m.calc.finalBoxes) != null ? m.calc.finalBoxes : m.finalBoxes) || 0;
          if (boxes > 0 && !m.is64Excluded && !m.isBlacklisted) {
            orderableCount++;
            totalBoxes += boxes;
            var pack = Number(m.packUnit) || 1;
            var price = Number(m.unitPrice) || 0;
            totalAmount += boxes * pack * price;
          }
        });
      }

      toast(
        '⚡ 자동 부팅 완료: 수주 ' + (orderRes.count || 0) + '종(' + (ordersInfo.usedDate || '') + ') · 실사재고 ' + (auditRes.matched || 0) + '건(' + (stockInfo.usedDate || '') + ') 즉시 반영!',
        'success'
      );

      sendBack(source, origin, {
        type: 'GFS_AUTO_BOOT_DONE',
        success: true,
        masterFileName: masterFileName,
        itemCount: Array.isArray(state.rawItems) ? state.rawItems.length : 0,
        orderMenuCount: orderRes.count || 0,
        orderTotalQty: orderRes.totalQty || 0,
        unmatchedMenus: orderRes.unmatchedMenus || [],
        auditMatchedCount: auditRes.matched || 0,
        auditDiscrepancyCount: auditRes.discrepancy || 0,
        orderableCount: orderableCount,
        totalBoxes: Math.round(totalBoxes * 10) / 10,
        totalAmount: Math.round(totalAmount),
      });
    } catch (err) {
      sendBack(source, origin, {
        type: 'GFS_AUTO_BOOT_DONE',
        success: false,
        error: String((err && err.message) || err),
      });
    }
  }

  // 5) 신메뉴+BOM 발주서 교체 반영 (실시간 재계산)
  async function handleMasterReplace(msg, source, origin) {
    try {
      var res = await loadMasterFromBase64(msg.base64, msg.fileName);
      if (Array.isArray(msg.orders) && msg.orders.length > 0) {
        applyOrders(msg.orders, null, null, msg.orderDate);
      } else if (Array.isArray(state.vegetableOrders) && state.vegetableOrders.length > 0) {
        applyOrders(state.vegetableOrders, null, null, '');
      }
      if (Array.isArray(msg.stock) && msg.stock.length > 0) {
        applyAudit(msg.stock, null, null, msg.stockDate);
      }
      if (typeof recalculateAll === 'function') recalculateAll();

      var unmatchedMenus = detectUnmatchedMenus(state.vegetableOrders || []);
      toast('📦 신메뉴 발주서(' + msg.fileName + ') 교체 및 재산출 완료!', 'success');

      sendBack(source, origin, {
        type: 'GFS_MASTER_APPLIED',
        success: true,
        fileName: res.fileName,
        itemCount: res.itemCount,
        unmatchedMenus: unmatchedMenus,
      });
    } catch (err) {
      sendBack(source, origin, {
        type: 'GFS_MASTER_APPLIED',
        success: false,
        error: String((err && err.message) || err),
      });
    }
  }

  // 6) GFS 내부에서 사용자가 직접 발주서 마스터를 올린 경우에도 DB에 자동 영구 저장
  function hookInternalMasterUpload() {
    if (typeof window.executeDualProcurement !== 'function' || window.__gfsMasterHooked) return;
    window.__gfsMasterHooked = true;
    var origExec = window.executeDualProcurement;
    window.executeDualProcurement = async function (masterWb, ordersWb, masterName, ordersName) {
      var r = await origExec.apply(this, arguments);
      try {
        if (state && state.pendingMaster && state.pendingMaster.buffer && state.pendingMaster.file) {
          var b64 = arrayBufferToBase64(state.pendingMaster.buffer);
          fetch('/api/gfs/master-sheet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName: masterName || state.pendingMaster.name || '발주서_마스터.xlsx',
              base64: b64,
              itemCount: Array.isArray(state.rawItems) ? state.rawItems.length : 431,
            }),
          })
            .then(function (resp) { return resp.json(); })
            .then(function (json) {
              if (json && json.success) {
                sendBack(null, null, {
                  type: 'GFS_MASTER_PERSISTED',
                  fileName: json.data.fileName,
                  asOf: json.data.asOf,
                  itemCount: json.data.itemCount,
                });
              }
            })
            .catch(function () {});
        }
      } catch (e) { /* ignore */ }
      return r;
    };
  }

  window.addEventListener('message', function (e) {
    try {
      if (e.origin !== window.location.origin) return;
      var msg = e.data || {};
      if (!msg || typeof msg.type !== 'string') return;
      if (msg.type === 'GFS_ORDERS') applyOrders(msg.items, e.source, e.origin, msg.orderDate);
      else if (msg.type === 'GFS_AUDIT') applyAudit(msg.items, e.source, e.origin, msg.stockDate);
      else if (msg.type === 'GFS_AUTO_BOOT') handleAutoBoot(msg.payload, e.source, e.origin);
      else if (msg.type === 'GFS_UPLOAD_MASTER') handleMasterReplace(msg, e.source, e.origin);
      else if (msg.type === 'GFS_TOGGLE_UPLOAD_SECTION') {
        var uploadSec = document.getElementById('uploadSection');
        if (uploadSec) {
          uploadSec.classList.toggle('hidden');
          if (!uploadSec.classList.contains('hidden')) {
            uploadSec.scrollIntoView({ behavior: 'smooth' });
          }
        }
      } else if (msg.type === 'GFS_SWITCH_CHANNEL') {
        if (typeof state !== 'undefined' && state && msg.channelId) {
          state.activeTab = msg.channelId;
          if (typeof renderTabs === 'function') renderTabs();
          if (typeof renderCards === 'function') renderCards();
        }
      } else if (msg.type === 'GFS_PING') sendBack(e.source, e.origin, { type: 'GFS_PONG', bridge: 2 });
    } catch (err) { /* ignore */ }
  });

  function onReady() {
    hookInternalMasterUpload();
    if (window.parent && window.parent !== window) {
      sendBack(window.parent, window.location.origin, { type: 'GFS_READY', bridge: 2 });
    } else {
      // 새창(/gfs/index.html 단독 실행)으로 열었을 때도 자동으로 ERP DB에서 3종 데이터를 불러와 즉시 부팅
      fetch('/api/gfs/auto-boot?includeMaster=1')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.success && j.data) {
            handleAutoBoot(j.data, null, null);
          }
        })
        .catch(function () {});
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(onReady, 80);
    });
  } else {
    setTimeout(onReady, 80);
  }

  window.GFS_BRIDGE = { version: 2 };
})();
