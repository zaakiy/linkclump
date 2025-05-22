import { SettingsManager } from "./settings_manager.js";

const settingsManager = new SettingsManager();

// Make Array.prototype.unique() available
Array.prototype.unique = function () {
  const a = [];
  for (let i = 0; i < this.length; i++) {
    let isUnique = true;
    for (let j = 0; j < a.length; j++) {
      if (this[i].url === a[j].url) {
        isUnique = false;
        break;
      }
    }
    if (isUnique) a.push(this[i]);
  }
  return a;
};

// Handle setup when extension is first installed or reloaded
chrome.runtime.onInstalled.addListener(() => {
  settingsManager.isInit((init) => {
    if (!init) {
      settingsManager.init(() => {
        injectContentAndOpenOptions();
      });
    } else {
      settingsManager.isLatest((latest) => {
        if (!latest) settingsManager.update();
      });
    }
  });
});

// Inject linkclump.js and open options page
function injectContentAndOpenOptions() {
  chrome.windows.getAll({ populate: true }, (windows) => {
    for (const win of windows) {
      for (const tab of win.tabs) {
        if (/^https?:\/\//.test(tab.url)) {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["linkclump.js"]
          });
        }
      }
    }
  });

  chrome.windows.create({
    url: chrome.runtime.getURL("pages/options.html?init=true"),
    width: 800,
    height: 850,
    type: "popup"
  });
}

// Handle all incoming messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.message === "init") {
    settingsManager.load((settings) => {
      if (!settings || settings.error) {
        sendResponse({ error: settings?.error || "Unknown error in settingsManager.load()" });
      } else {
        sendResponse(settings);
      }
    });
    return true;
  }

  if (request.message === "update") {
    settingsManager.save(request.settings, () => {
      settingsManager.load((newSettings) => {
        chrome.windows.getAll({ populate: true }, (windowList) => {
          for (const window of windowList) {
            for (const tab of window.tabs) {
              // ✅ PATCH HERE
              chrome.tabs.sendMessage(tab.id, {
                message: "update",
                settings: newSettings
              }, () => {
                if (chrome.runtime.lastError) {
                  console.warn(`Linkclump: Could not update tab ${tab.id}`, chrome.runtime.lastError.message);
                }
              });
            }
          }
        });
      });
    });
    return true;
  }

  if (request.message === "activate") {
    console.log("Linkclump background: received activate", request.urls.length, "tabs");

    let urls = request.urls;
    const opts = request.setting.options;

    if (opts.block) urls = urls.unique();
    if (urls.length === 0) return;
    if (opts.reverse) urls.reverse();

    switch (request.setting.action) {
      case "copy":
        let text = urls.map((u) => formatLink(u, opts.copy)).join("");
        if (opts.copy == AS_LIST_LINK_HTML) {
          text = "<ul>\n" + text + "</ul>\n";
        }
        navigator.clipboard.writeText(text);
        break;

      case "bm":
        chrome.bookmarks.getTree((bookmarkTreeNodes) => {
          const parentId = bookmarkTreeNodes[0].children[1].id;
          chrome.bookmarks.create(
            {
              parentId,
              title: "Linkclump " + timeConverter(new Date())
            },
            (folder) => {
              for (const { title, url } of urls) {
                chrome.bookmarks.create({
                  parentId: folder.id,
                  title,
                  url
                });
              }
            }
          );
        });
        break;

      case "win":
        chrome.windows.getCurrent((currentWindow) => {
          chrome.windows.create(
            { url: urls.shift().url, focused: !opts.unfocus },
            (newWindow) => {
              if (urls.length > 0) {
                openTab(urls, opts.delay, newWindow.id, null, null, 0);
              }
            }
          );
          if (opts.unfocus) {
            chrome.windows.update(currentWindow.id, { focused: true });
          }
        });
        break;

      case "tabs":
        chrome.tabs.get(sender.tab.id, (tab) => {
          chrome.windows.getCurrent((window) => {
            const index = opts.end ? null : tab.index + 1;
            openTab(urls, opts.delay, window.id, tab.id, index, opts.close);
          });
        });
        break;
    }
  }
});

// === Helper Functions ===

function openTab(urls, delay, windowId, openerTabId, tabPosition, closeTime) {
  const obj = {
    windowId,
    url: urls.shift().url,
    active: false
  };

  if (!delay) obj.openerTabId = openerTabId;
  if (tabPosition != null) {
    obj.index = tabPosition;
    tabPosition++;
  }

  chrome.tabs.create(obj, (tab) => {
    if (closeTime > 0) {
      setTimeout(() => chrome.tabs.remove(tab.id), closeTime * 1000);
    }
  });

  if (urls.length > 0) {
    setTimeout(() => openTab(urls, delay, windowId, openerTabId, tabPosition, closeTime), delay * 1000);
  }
}

function copyToClipboard(text) {
  const textarea = document.createElement("textarea");
  textarea.contentEditable = true;
  document.body.appendChild(textarea);
  textarea.innerHTML = text;
  textarea.unselectable = "off";
  textarea.focus();
  document.execCommand("SelectAll");
  document.execCommand("Copy", false, null);
  document.body.removeChild(textarea);
}

function pad(number, length) {
  let str = "" + number;
  while (str.length < length) str = "0" + str;
  return str;
}

function timeConverter(a) {
  const year = a.getFullYear();
  const month = pad(a.getMonth() + 1, 2);
  const day = pad(a.getDate(), 2);
  const hour = pad(a.getHours(), 2);
  const min = pad(a.getMinutes(), 2);
  const sec = pad(a.getSeconds(), 2);
  return `${year}-${month}-${day} ${hour}:${min}:${sec}`;
}

// Copy format modes
const URLS_WITH_TITLES = 0;
const URLS_ONLY = 1;
const URLS_ONLY_SPACE_SEPARATED = 2;
const TITLES_ONLY = 3;
const AS_LINK_HTML = 4;
const AS_LIST_LINK_HTML = 5;
const AS_MARKDOWN = 6;

function formatLink({ url, title }, copyFormat) {
  switch (parseInt(copyFormat)) {
    case URLS_WITH_TITLES: return `${title}\t${url}\n`;
    case URLS_ONLY: return `${url}\n`;
    case URLS_ONLY_SPACE_SEPARATED: return `${url} `;
    case TITLES_ONLY: return `${title}\n`;
    case AS_LINK_HTML: return `<a href="${url}">${title}</a>\n`;
    case AS_LIST_LINK_HTML: return `<li><a href="${url}">${title}</a></li>\n`;
    case AS_MARKDOWN: return `[${title}](${url})\n`;
  }
}
