(function (global) {
  "use strict";

  var DB_NAME = "careerWorkbench.jobBatchAssets.v1";
  var DB_VERSION = 2;
  var BATCH_STORE = "batches";
  var SCREENSHOT_STORE = "screenshots";
  var RECOGNITION_STORE = "recognitionCache";
  var databasePromise = null;
  var currentDatabase = null;

  function openDatabase() {
    if (databasePromise) return databasePromise;
    var opening = new Promise(function (resolve, reject) {
      var failed = false;
      function fail(error) { failed = true; reject(error); }
      if (!global.indexedDB) {
        reject(new Error("当前浏览器不支持IndexedDB"));
        return;
      }
      var request = global.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        var database = request.result;
        if (!database.objectStoreNames.contains(BATCH_STORE)) {
          database.createObjectStore(BATCH_STORE, { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains(SCREENSHOT_STORE)) {
          var screenshotStore = database.createObjectStore(SCREENSHOT_STORE, { keyPath: "id" });
          screenshotStore.createIndex("batchId", "batchId", { unique: false });
        }
        if (!database.objectStoreNames.contains(RECOGNITION_STORE)) {
          database.createObjectStore(RECOGNITION_STORE, { keyPath: "contentHash" });
        }
      };
      request.onsuccess = function () {
        var database = request.result;
        if (failed) { database.close(); return; }
        currentDatabase = database;
        function invalidate() {
          if (currentDatabase === database) { currentDatabase = null; databasePromise = null; }
        }
        database.onversionchange = function () { invalidate(); database.close(); };
        database.onclose = invalidate;
        resolve(database);
      };
      request.onerror = function () { fail(request.error || new Error("无法打开JD批次存储")); };
      request.onblocked = function () { fail(new Error("JD批次存储被其他页面占用")); };
    });
    databasePromise = opening;
    opening.catch(function () { if (databasePromise === opening) databasePromise = null; });
    return databasePromise;
  }

  function beginTransaction(database, stores, mode) {
    try { return database.transaction(stores, mode); }
    catch (error) {
      if (error && error.name === "InvalidStateError" && currentDatabase === database) {
        currentDatabase = null; databasePromise = null;
        database.close();
      }
      throw error; // The caller may retry explicitly; never replay a failed write.
    }
  }

  function validId(value) { return typeof value === "string" && value.trim().length > 0; }
  function validateBatch(record) {
    if (!record || !validId(record.id) || !record.batch || typeof record.batch !== "object" ||
        Array.isArray(record.batch) || record.batch.id !== record.id ||
        (record.batch.results !== undefined && !Array.isArray(record.batch.results)) ||
        (record.batch.groups !== undefined && !Array.isArray(record.batch.groups))) {
      throw new Error("JD批次记录损坏，未修改原数据");
    }
  }

  function requestResult(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error("读取JD批次失败")); };
    });
  }

  function transactionDone(transaction) {
    return new Promise(function (resolve, reject) {
      transaction.oncomplete = function () { resolve(true); };
      transaction.onerror = function () { reject(transaction.error || new Error("保存JD批次失败")); };
      transaction.onabort = function () { reject(transaction.error || new Error("保存JD批次已中止")); };
    });
  }

  function cloneSerializable(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function batchRecord(batch) {
    var snapshot = cloneSerializable(batch);
    var updatedAt = new Date().toISOString();
    return {
      id: snapshot.id,
      direction: snapshot.direction || "",
      createdAt: snapshot.createdAt || updatedAt,
      updatedAt: updatedAt,
      completedAt: snapshot.completedAt || "",
      screenshotCount: Array.isArray(snapshot.results) ? snapshot.results.length : 0,
      jobCount: Array.isArray(snapshot.groups) ? snapshot.groups.length : 0,
      workflowStep: Number(snapshot.workflowStep) || 1,
      batch: snapshot,
    };
  }

  function saveBatch(batch) {
    if (!batch || !batch.id) return Promise.reject(new Error("JD批次缺少ID"));
    return openDatabase().then(function (database) {
      var transaction = beginTransaction(database, [BATCH_STORE], "readwrite");
      transaction.objectStore(BATCH_STORE).put(batchRecord(batch));
      return transactionDone(transaction);
    });
  }

  function saveScreenshots(batchId, files) {
    if (!batchId) return Promise.reject(new Error("JD批次缺少ID"));
    if (!Array.isArray(files) || files.some(function (file) { return file != null && !(file instanceof global.Blob); })) {
      return Promise.reject(new Error("截图参数格式错误，原截图未修改"));
    }
    files = files.slice();
    return openDatabase().then(function (database) {
      var transaction = beginTransaction(database, [SCREENSHOT_STORE], "readwrite");
      var done = transactionDone(transaction);
      var writeError = null;
      var store = transaction.objectStore(SCREENSHOT_STORE);
      var index = store.index("batchId");
      var keysRequest = index.getAllKeys(batchId);
      keysRequest.onsuccess = function () {
        try {
        (keysRequest.result || []).forEach(function (key) { store.delete(key); });
        (Array.isArray(files) ? files : []).forEach(function (file, fileIndex) {
          if (!file) return;
          store.put({
            id: batchId + ":" + fileIndex,
            batchId: batchId,
            index: fileIndex,
            name: file.name || "截图" + (fileIndex + 1) + ".png",
            type: file.type || "image/png",
            lastModified: Number(file.lastModified) || Date.now(),
            size: Number(file.size) || 0,
            blob: file,
          });
        });
        } catch (error) { writeError = error; transaction.abort(); }
      };
      return done.catch(function (error) { throw writeError || error; });
    });
  }

  // Explicitly preserve, replace a complete set, or clear after confirmation.
  // Both stores commit together; an aborted image write also rolls back the batch.
  function saveBatchWithScreenshots(batch, options) {
    var record, mode, files;
    try {
      record = batchRecord(batch);
      validateBatch(record);
      if (!Array.isArray(record.batch.results) || !Array.isArray(record.batch.groups)) throw new Error("批次资料不完整");
      mode = options && options.mode;
      if (["preserve", "replace", "clear"].indexOf(mode) < 0) throw new Error("请明确截图保存方式");
      files = options.files;
      if (mode === "preserve" && files !== undefined) throw new Error("仅更新文字时不能传入替换截图");
      if (mode === "clear" && (options.confirmClear !== true || !Array.isArray(files) || files.length)) throw new Error("清空截图需要明确确认和空数组");
      if (mode === "replace") {
        if (!Array.isArray(files) || !files.length || files.length !== record.batch.results.length) throw new Error("截图数量与批次不一致，未保存");
        files = files.slice();
        for (var i = 0; i < files.length; i += 1) {
          if (!(files[i] instanceof global.Blob) || files[i].size === 0 || files[i]._historyPlaceholder) throw new Error("缺失或占位截图不能替换原图");
        }
      }
    } catch (error) { return Promise.reject(error); }
    return openDatabase().then(function (database) {
      var transaction = beginTransaction(database, [BATCH_STORE, SCREENSHOT_STORE], "readwrite");
      var writeError = null, complete = false;
      var done = new Promise(function (resolve, reject) {
        transaction.oncomplete = function () { resolve(true); };
        transaction.onabort = function () { reject(writeError || transaction.error || new Error("批次和截图保存已整体撤销")); };
        transaction.onerror = function () { /* Default request errors abort; wait for rollback. */ };
      });
      var batches = transaction.objectStore(BATCH_STORE), images = transaction.objectStore(SCREENSHOT_STORE);
      function abort(error) { writeError = error; transaction.abort(); }
      try {
        if (mode === "preserve") {
          var old = batches.get(record.id);
          old.onsuccess = function () {
            try {
              if (!old.result) throw new Error("批次尚未保存，请先完整保存");
              validateBatch(old.result);
              var previous = old.result.batch.results || [];
              if (previous.length !== record.batch.results.length || previous.some(function (item, index) {
                return !item || !record.batch.results[index] || item.id !== record.batch.results[index].id;
              })) throw new Error("截图对应关系已变化，不能只更新文字");
              var existing = images.index("batchId").getAll(record.id);
              existing.onsuccess = function () {
                try {
                  complete = record.batch.results.every(function (_, index) {
                    return existing.result.some(function (item) { return item.index === index && item.blob instanceof global.Blob && item.blob.size > 0; });
                  });
                  batches.put(record);
                } catch (error) { abort(error); }
              };
            } catch (error) { abort(error); }
          };
        } else {
          var keys = images.index("batchId").getAllKeys(record.id);
          keys.onsuccess = function () {
            try {
              batches.put(record);
              keys.result.forEach(function (key) { images.delete(key); });
              if (mode === "replace") files.forEach(function (file, index) {
                images.put({ id: record.id + ":" + index, batchId: record.id, index: index,
                  name: file.name || "截图" + (index + 1) + ".png", type: file.type || "image/png",
                  lastModified: Number(file.lastModified) || Date.now(), size: file.size, blob: file });
              });
              complete = mode === "replace" || record.batch.results.length === 0;
            } catch (error) { abort(error); }
          };
        }
      } catch (error) { abort(error); }
      // Wait for abort/complete (not only an individual request's error).
      return done.then(function () { return { screenshotsComplete: complete }; }, function (error) { throw writeError || error; });
    });
  }

  function restoreFile(record) {
    if (!record || !record.blob) return null;
    try {
      return new File([record.blob], record.name, {
        type: record.type || record.blob.type || "image/png",
        lastModified: record.lastModified || Date.now(),
      });
    } catch (error) {
      var blob = record.blob;
      try {
        Object.defineProperty(blob, "name", { value: record.name, configurable: true });
        Object.defineProperty(blob, "lastModified", { value: record.lastModified || Date.now(), configurable: true });
      } catch (defineError) { /* 旧浏览器仍可使用Blob进行OCR。 */ }
      return blob;
    }
  }

  function loadBatch(batchId) {
    return openDatabase().then(function (database) {
      var transaction = beginTransaction(database, [BATCH_STORE, SCREENSHOT_STORE], "readonly");
      var batchRequest = transaction.objectStore(BATCH_STORE).get(batchId);
      var screenshotsRequest = transaction.objectStore(SCREENSHOT_STORE).index("batchId").getAll(batchId);
      return Promise.all([requestResult(batchRequest), requestResult(screenshotsRequest)]).then(function (results) {
        if (results[0] === undefined) return null;
        validateBatch(results[0]);
        var files = [];
        (results[1] || []).sort(function (left, right) { return left.index - right.index; }).forEach(function (record) {
          files[record.index] = restoreFile(record);
        });
        return { record: results[0], batch: cloneSerializable(results[0].batch), files: files };
      });
    });
  }

  function listBatches() {
    return openDatabase().then(function (database) {
      var transaction = beginTransaction(database, [BATCH_STORE], "readonly");
      return requestResult(transaction.objectStore(BATCH_STORE).getAll()).then(function (records) {
        (records || []).forEach(validateBatch);
        return (records || []).sort(function (left, right) {
          return String(right.updatedAt || right.createdAt).localeCompare(String(left.updatedAt || left.createdAt));
        });
      });
    });
  }

  function deleteBatches(batchIds) {
    var ids = Array.isArray(batchIds) ? batchIds.filter(Boolean) : [];
    if (!ids.length) return Promise.resolve(true);
    return openDatabase().then(function (database) {
      var transaction = beginTransaction(database, [BATCH_STORE, SCREENSHOT_STORE], "readwrite");
      var batchStore = transaction.objectStore(BATCH_STORE);
      var screenshotStore = transaction.objectStore(SCREENSHOT_STORE);
      var screenshotIndex = screenshotStore.index("batchId");
      ids.forEach(function (batchId) {
        batchStore.delete(batchId);
        var request = screenshotIndex.getAllKeys(batchId);
        request.onsuccess = function () {
          (request.result || []).forEach(function (key) { screenshotStore.delete(key); });
        };
      });
      return transactionDone(transaction);
    });
  }

  function unlinkJobs(jobIds) {
    var ids = Array.isArray(jobIds) ? jobIds.filter(Boolean) : [];
    if (!ids.length) return Promise.resolve(true);
    var lookup = {};
    ids.forEach(function (id) { lookup[id] = true; });
    return openDatabase().then(function (database) {
      var transaction = beginTransaction(database, [BATCH_STORE], "readwrite");
      var store = transaction.objectStore(BATCH_STORE);
      var request = store.getAll();
      request.onsuccess = function () {
        (request.result || []).forEach(function (record) {
          var changed = false;
          var groups = record && record.batch && Array.isArray(record.batch.groups) ? record.batch.groups : [];
          groups.forEach(function (group) {
            if (group && lookup[group.jobId]) {
              group.jobId = "";
              changed = true;
            }
          });
          if (changed) store.put(record);
        });
      };
      return transactionDone(transaction);
    });
  }

  function saveRecognition(record) {
    if (!record || !record.contentHash || !record.text || record.recognitionStatus !== "success") {
      return Promise.reject(new Error("只缓存包含图片Hash的成功OCR结果"));
    }
    return openDatabase().then(function (database) {
      var transaction = beginTransaction(database, [RECOGNITION_STORE], "readwrite");
      transaction.objectStore(RECOGNITION_STORE).put(Object.assign({}, cloneSerializable(record), {
        cachedAt: record.cachedAt || new Date().toISOString(),
      }));
      return transactionDone(transaction);
    });
  }

  function getRecognition(contentHash) {
    if (!contentHash) return Promise.resolve(null);
    return openDatabase().then(function (database) {
      var transaction = beginTransaction(database, [RECOGNITION_STORE], "readonly");
      return requestResult(transaction.objectStore(RECOGNITION_STORE).get(contentHash));
    });
  }

  function exportRecords() {
    return openDatabase().then(function (database) {
      var stores = [BATCH_STORE, SCREENSHOT_STORE, RECOGNITION_STORE];
      var transaction = beginTransaction(database, stores, "readonly");
      return Promise.all(stores.map(function (storeName) {
        return requestResult(transaction.objectStore(storeName).getAll());
      })).then(function (records) {
        return {
          databaseName: DB_NAME,
          databaseVersion: DB_VERSION,
          stores: {
            batches: records[0] || [],
            screenshots: records[1] || [],
            recognitionCache: records[2] || [],
          },
        };
      });
    });
  }

  function replaceRecords(snapshot) {
    var recordsByStore;
    try {
      var source = snapshot && snapshot.stores;
      if (!source || (snapshot.databaseName !== undefined && snapshot.databaseName !== DB_NAME) ||
          (snapshot.databaseVersion !== undefined && snapshot.databaseVersion !== DB_VERSION)) throw new Error("恢复资料数据库信息不匹配");
      [BATCH_STORE, SCREENSHOT_STORE, RECOGNITION_STORE].forEach(function (name) {
        if (!Array.isArray(source[name])) throw new Error("恢复资料缺少或损坏集合：" + name);
        var seen = new Set();
        source[name].forEach(function (record) {
          var id = record && record[name === RECOGNITION_STORE ? "contentHash" : "id"];
          if (!validId(id) || seen.has(id)) throw new Error("恢复资料记录ID缺失或重复：" + name);
          seen.add(id);
          if (name === BATCH_STORE) validateBatch(record);
          if (name === SCREENSHOT_STORE && (!validId(record.batchId) || !Number.isInteger(record.index) || record.index < 0 ||
              !validId(record.name) || !(record.blob instanceof global.Blob))) throw new Error("恢复截图记录不完整");
          if (name === RECOGNITION_STORE && (typeof record.text !== "string" || !record.text.trim() || record.recognitionStatus !== "success")) throw new Error("恢复OCR记录不完整");
        });
      });
      // Freeze the validated input before waiting for the connection. Blob data is preserved.
      recordsByStore = global.structuredClone(source);
    } catch (error) { return Promise.reject(error); }
    return openDatabase().then(function (database) {
      var stores = [BATCH_STORE, SCREENSHOT_STORE, RECOGNITION_STORE];
      var transaction = beginTransaction(database, stores, "readwrite");
      var done = transactionDone(transaction);
      try {
        stores.forEach(function (storeName) {
          var store = transaction.objectStore(storeName);
          store.clear();
          recordsByStore[storeName].forEach(function (record) { store.put(record); });
        });
      } catch (error) {
        transaction.abort();
        return done.catch(function () { throw error; });
      }
      return done;
    });
  }

  global.jobBatchStore = {
    isSupported: function () { return Boolean(global.indexedDB); },
    saveBatch: saveBatch,
    saveBatchWithScreenshots: saveBatchWithScreenshots,
    saveScreenshots: saveScreenshots,
    loadBatch: loadBatch,
    listBatches: listBatches,
    deleteBatches: deleteBatches,
    unlinkJobs: unlinkJobs,
    saveRecognition: saveRecognition,
    getRecognition: getRecognition,
    exportRecords: exportRecords,
    replaceRecords: replaceRecords,
  };
})(typeof window !== "undefined" ? window : globalThis);
