(function () {
  "use strict";

  var SELECTOR = "details.workspace-collapsible";
  var EXPANDED_GRID_ITEM_CLASS = "workspace-collapsible-grid-item--expanded";
  var ACTIVE_GRID_CLASS = "workspace-collapsible-grid--active";

  function directSummary(details) {
    for (var index = 0; index < details.children.length; index += 1) {
      if (details.children[index].tagName === "SUMMARY") return details.children[index];
    }
    return null;
  }

  function enhanceOne(details) {
    if (!details || details.getAttribute("data-collapsible-ready") === "true") return;
    var summary = directSummary(details);
    if (!summary) return;

    summary.classList.add("workspace-collapsible__summary");
    var body = null;
    for (var index = 0; index < details.children.length; index += 1) {
      if (details.children[index].classList.contains("workspace-collapsible__body")) {
        body = details.children[index];
        break;
      }
    }
    if (!body) {
      body = document.createElement("div");
      body.className = "workspace-collapsible__body";
      var movable = [];
      for (var childIndex = 0; childIndex < details.children.length; childIndex += 1) {
        if (details.children[childIndex] !== summary) movable.push(details.children[childIndex]);
      }
      movable.forEach(function (child) {
        body.appendChild(child);
      });
      details.appendChild(body);
    }
    details.setAttribute("data-collapsible-ready", "true");
    syncExpandedGridItem(details);
  }

  function enhance(root) {
    if (!root) return;
    if (root.matches && root.matches(SELECTOR)) enhanceOne(root);
    if (!root.querySelectorAll) return;
    var items = root.querySelectorAll(SELECTOR);
    for (var index = 0; index < items.length; index += 1) enhanceOne(items[index]);
  }

  function handleToggle(event) {
    var current = event.target;
    if (!current || !current.matches || !current.matches(SELECTOR)) return;
    syncExpandedGridItem(current);
    if (!current.open) return;
    var group = current.getAttribute("data-collapsible-group");
    if (!group) return;
    var scope = findCollapsibleScope(current);
    var items = scope.querySelectorAll(SELECTOR + "[data-collapsible-group=\"" + cssEscape(group) + "\"]");
    for (var index = 0; index < items.length; index += 1) {
      if (items[index] !== current) {
        items[index].open = false;
        syncExpandedGridItem(items[index]);
      }
    }
  }

  function syncExpandedGridItem(details) {
    var context = findNearestGridContext(details);
    var gridItem = context.item;
    if (!gridItem || !gridItem.classList) return;
    if (details.open) {
      gridItem.classList.add(EXPANDED_GRID_ITEM_CLASS);
      syncGridContainer(context.grid);
      return;
    }
    if (!hasOpenCollapsible(gridItem, details)) {
      gridItem.classList.remove(EXPANDED_GRID_ITEM_CLASS);
    }
    syncGridContainer(context.grid);
  }

  function findNearestGridContext(details) {
    if (!window.getComputedStyle) return { item: details, grid: null };
    var current = details;
    while (current && current.parentElement) {
      var parent = current.parentElement;
      var display = window.getComputedStyle(parent).display;
      if (display === "grid" || display === "inline-grid") {
        return { item: current, grid: parent };
      }
      current = parent;
    }
    return { item: details, grid: null };
  }

  function findCollapsibleScope(details) {
    var explicitScope = details.closest("[data-collapsible-scope]");
    if (explicitScope) return explicitScope;
    return findNearestGridContext(details).grid || document;
  }

  function syncGridContainer(grid) {
    if (!grid || !grid.classList || !grid.children) return;
    var hasExpandedItem = false;
    for (var index = 0; index < grid.children.length; index += 1) {
      if (grid.children[index].classList && grid.children[index].classList.contains(EXPANDED_GRID_ITEM_CLASS)) {
        hasExpandedItem = true;
        break;
      }
    }
    if (hasExpandedItem) grid.classList.add(ACTIVE_GRID_CLASS);
    else grid.classList.remove(ACTIVE_GRID_CLASS);
  }

  function hasOpenCollapsible(root, ignored) {
    if (root !== ignored && root.matches && root.matches(SELECTOR) && root.open) return true;
    if (!root.children) return false;
    for (var index = 0; index < root.children.length; index += 1) {
      if (hasOpenCollapsible(root.children[index], ignored)) return true;
    }
    return false;
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
    return String(value).replace(/["\\]/g, "\\$&");
  }

  window.WorkspaceCollapsible = {
    enhance: enhance,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { enhance(document); });
  } else {
    enhance(document);
  }

  // toggle 不需要每张动态卡片重复绑定；捕获阶段的公共监听同时覆盖
  // 首次渲染、历史记录和之后加入页面的新记录。
  document.addEventListener("toggle", handleToggle, true);

  if (typeof MutationObserver !== "undefined") {
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        for (var index = 0; index < mutation.addedNodes.length; index += 1) {
          enhance(mutation.addedNodes[index]);
        }
        if (mutation.removedNodes && mutation.removedNodes.length) {
          var targetContext = findNearestGridContext(mutation.target);
          var targetGrid = targetContext.grid;
          if (window.getComputedStyle && mutation.target && mutation.target.classList) {
            var targetDisplay = window.getComputedStyle(mutation.target).display;
            if (targetDisplay === "grid" || targetDisplay === "inline-grid") targetGrid = mutation.target;
          }
          syncGridContainer(targetGrid);
        }
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
