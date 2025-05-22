export class SettingsManager {
  constructor() {
    this.CURRENT_VERSION = "5";
  }

  load(callback) {
    chrome.storage.local.get(["settings"], (result) => {
      if (chrome.runtime.lastError) {
        console.error("Storage error:", chrome.runtime.lastError);
        callback({ error: "Error loading settings." });
        return;
      }

      let settings = result.settings;
      if (!settings) {
        settings = this.init(callback); // async init
      } else {
        callback(settings);
      }
    });
  }

  save(settings, callback = () => {}) {
    if (settings.error !== undefined) delete settings.error;
    chrome.storage.local.set({ settings }, callback);
  }

  isInit(callback) {
    chrome.storage.local.get(["version"], (result) => {
      callback(result.version !== undefined);
    });
  }

  isLatest(callback) {
    chrome.storage.local.get(["version"], (result) => {
      callback(result.version === this.CURRENT_VERSION);
    });
  }

  init(callback = () => {}) {
    const settings = {
      actions: {
        "101": {
          mouse: 0,
          key: 90,
          action: "tabs",
          color: "#FFA500",
          options: {
            smart: 0,
            ignore: [0],
            delay: 0,
            close: 0,
            block: true,
            reverse: false,
            end: false
          }
        }
      },
      blocked: []
    };

    chrome.storage.local.set({ settings, version: this.CURRENT_VERSION }, () => {
      callback(settings);
    });

    return settings;
  }

  update(callback = () => {}) {
    this.isInit((initialized) => {
      if (!initialized) {
        this.init(callback);
      } else {
        callback();
      }
    });
  }
}
