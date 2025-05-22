const END_KEYCODE = 35;
const HOME_KEYCODE = 36;
const Z_INDEX = 2147483647;
const OS_WIN = 1;
const OS_LINUX = 0;
const LEFT_BUTTON = 0;
const EXCLUDE_LINKS = 0;
const INCLUDE_LINKS = 1;

let settings = null;
let setting = -1;
let key_pressed = 0;
let mouse_button = null;
let stop_menu = false;
let box_on = false;
let smart_select = false;
let mouse_x = -1;
let mouse_y = -1;
let scroll_id = 0;
let links = [];
let box = null;
let count_label = null;
let os = navigator.appVersion.indexOf("Win") === -1 ? OS_LINUX : OS_WIN;
let timer = 0;

function sendMessagePromise(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        resolve(response);
      });
    } catch (err) {
      reject(err);
    }
  });
}

if (typeof chrome !== "undefined" && chrome.runtime && typeof chrome.runtime.sendMessage === "function") {
  sendMessagePromise({ message: "init" })
    .then((response) => {
      if (!response) {
        console.warn("Linkclump: No response from background.");
        return;
      }

      // Your original logic here
      settings = response.actions;
      let allowed = true;
      for (let pattern of response.blocked) {
        if (pattern && new RegExp(pattern, "i").test(window.location.href)) {
          allowed = false;
          console.log(`Linkclump is blocked on this site: ${pattern}`);
        }
      }

      if (allowed) {
        window.addEventListener("mousedown", mousedown, true);
        window.addEventListener("keydown", keydown, true);
        window.addEventListener("keyup", keyup, true);
        window.addEventListener("blur", blur, true);
        window.addEventListener("contextmenu", contextmenu, true);
      }
    })
    .catch((err) => {
      console.warn("Linkclump: Could not connect to background script", err);
    });
} else {
  console.warn("Linkclump: chrome.runtime.sendMessage is unavailable.");
}

chrome.runtime?.onMessage?.addListener((request, sender, callback) => {
  if (request.message === "update") {
    settings = request.settings.actions;
  }
});

// The rest of your original linkclump.js functions (e.g. mousedown, keydown, mousemove, etc.)
// can be included below this point unchanged — as they don’t require changes for V3.

function mousemove(event) {
	prevent_escalation(event);

	if (allow_selection() || scroll_bug_ignore) {
		scroll_bug_ignore = false;
		update_box(event.pageX, event.pageY);

		while (!detech(event.pageX, event.pageY, false)) {}
	} else {
		if (timer === 0) {
			stop();
		}
	}
}

function clean_up() {
	box.style.visibility = "hidden";
	count_label.style.visibility = "hidden";
	box_on = false;

	for (var i = 0; i < links.length; i++) {
		if (links[i].box !== null) {
			document.body.removeChild(links[i].box);
			links[i].box = null;
		}
	}
	links = [];

	smart_select = false;
	mouse_button = -1;
	key_pressed = 0;
}

function mousedown(event) {
	mouse_button = event.button;

	if (os === OS_WIN) stop_menu = false;

	if (allow_selection()) {
		if (os === OS_LINUX || (os === OS_WIN && mouse_button === LEFT_BUTTON)) {
			prevent_escalation(event);
		}

		if (timer !== 0) {
			clearTimeout(timer);
			timer = 0;
			if (os === OS_WIN) stop_menu = true;
		} else {
			if (box_on) {
				console.log("box wasn't removed from previous operation");
				clean_up();
			}

			if (box === null) {
				box = document.createElement("span");
				box.style.margin = "0px auto";
				box.style.border = "2px dotted" + settings[setting].color;
				box.style.position = "absolute";
				box.style.zIndex = Z_INDEX;
				box.style.visibility = "hidden";

				count_label = document.createElement("span");
				count_label.style.zIndex = Z_INDEX;
				count_label.style.position = "absolute";
				count_label.style.visibility = "hidden";
				count_label.style.left = "10px";
				count_label.style.width = "50px";
				count_label.style.top = "10px";
				count_label.style.height = "20px";
				count_label.style.fontSize = "10px";
				count_label.style.font = "Arial, sans-serif";
				count_label.style.color = "black";

				document.body.appendChild(box);
				document.body.appendChild(count_label);
			}

			box.x = event.pageX;
			box.y = event.pageY;
			update_box(event.pageX, event.pageY);

			window.addEventListener("mousemove", mousemove, true);
			window.addEventListener("mouseup", mouseup, true);
			window.addEventListener("mousewheel", mousewheel, true);
			window.addEventListener("mouseout", mouseout, true);
		}
	}
}

function update_box(x, y) {
	var width = Math.max(document.documentElement.clientWidth, document.body.scrollWidth, document.documentElement.scrollWidth, document.body.offsetWidth, document.documentElement.offsetWidth);
	var height = Math.max(document.documentElement.clientHeight, document.body.scrollHeight, document.documentElement.scrollHeight, document.body.offsetHeight, document.documentElement.offsetHeight);
	x = Math.min(x, width - 7);
	y = Math.min(y, height - 7);

	if (x > box.x) {
		box.x1 = box.x;
		box.x2 = x;
	} else {
		box.x1 = x;
		box.x2 = box.x;
	}
	if (y > box.y) {
		box.y1 = box.y;
		box.y2 = y;
	} else {
		box.y1 = y;
		box.y2 = box.y;
	}

	box.style.left = box.x1 + "px";
	box.style.width = box.x2 - box.x1 + "px";
	box.style.top = box.y1 + "px";
	box.style.height = box.y2 - box.y1 + "px";

	count_label.style.left = x - 15 + "px";
	count_label.style.top = y - 15 + "px";
}

function mousewheel() {
	scroll_bug_ignore = true;
}

function mouseout(event) {
	mousemove(event);
	scroll_bug_ignore = true;
}

function prevent_escalation(event) {
	event.stopPropagation();
	event.preventDefault();
}

function mouseup(event) {
  prevent_escalation(event);

  if (box_on) {
    if (allow_selection() && timer === 0) {
      timer = setTimeout(() => {
        update_box(event.pageX, event.pageY);
        detech(event.pageX, event.pageY, true);
        stop();
        timer = 0;
      }, 100);
    }
  } else {
    stop();
  }
}

function getXY(element) {
	var x = 0, y = 0, parent = element;

	do {
		var style = window.getComputedStyle(parent);
		var matrix = new WebKitCSSMatrix(style.webkitTransform);
		x += parent.offsetLeft + matrix.m41;
		y += parent.offsetTop + matrix.m42;
	} while (parent = parent.offsetParent);

	parent = element;
	while (parent && parent !== document.body) {
		if (parent.scrollLeft) x -= parent.scrollLeft;
		if (parent.scrollTop) y -= parent.scrollTop;
		parent = parent.parentNode;
	}

	return { x, y };
}

function start() {
	document.body.style.khtmlUserSelect = "none";
	box.style.visibility = "visible";
	count_label.style.visibility = "visible";

	var page_links = document.links;
	var re1 = /^javascript:/i;
	var re2 = new RegExp(settings[setting].options.ignore.slice(1).join("|"), "i");
	var re3 = /^H\d$/;

	for (var i = 0; i < page_links.length; i++) {
		if (re1.test(page_links[i].href)) continue;
		if (!page_links[i].getAttribute("href") || page_links[i].getAttribute("href") === "#") continue;

		if (settings[setting].options.ignore.length > 1) {
			if (re2.test(page_links[i].href) || re2.test(page_links[i].innerHTML)) {
				if (settings[setting].options.ignore[0] === EXCLUDE_LINKS) continue;
			} else if (settings[setting].options.ignore[0] === INCLUDE_LINKS) continue;
		}

		var comp = window.getComputedStyle(page_links[i]);
		if (comp.visibility === "hidden" || comp.display === "none") continue;

		var pos = getXY(page_links[i]);
		var width = page_links[i].offsetWidth;
		var height = page_links[i].offsetHeight;

		for (var k = 0; k < page_links[i].childNodes.length; k++) {
			if (page_links[i].childNodes[k].nodeName === "IMG") {
				const pos2 = getXY(page_links[i].childNodes[k]);
				if (pos.y >= pos2.y) {
					pos.y = pos2.y;
					width = Math.max(width, page_links[i].childNodes[k].offsetWidth);
					height = Math.max(height, page_links[i].childNodes[k].offsetHeight);
				}
			}
		}

		page_links[i].x1 = pos.x;
		page_links[i].y1 = pos.y;
		page_links[i].x2 = pos.x + width;
		page_links[i].y2 = pos.y + height;
		page_links[i].width = width;
		page_links[i].height = height;
		page_links[i].box = null;
		page_links[i].important = settings[setting].options.smart === 0 && page_links[i].parentNode && re3.test(page_links[i].parentNode.nodeName);

		links.push(page_links[i]);
	}

	box_on = true;
	if (os === OS_WIN) stop_menu = true;
}

function stop() {
	document.body.style.khtmlUserSelect = "";
	window.removeEventListener("mousemove", mousemove, true);
	window.removeEventListener("mouseup", mouseup, true);
	window.removeEventListener("mousewheel", mousewheel, true);
	window.removeEventListener("mouseout", mouseout, true);
	if (box_on) clean_up();
	if (os === OS_LINUX && settings[setting].key !== key_pressed) stop_menu = false;
}

function scroll() {
	if (allow_selection()) {
		var y = mouse_y - window.scrollY;
		var win_height = window.innerHeight;

		if (y > win_height - 20) {
			let speed = y < 2 ? 60 : y < 10 ? 30 : 10;
			window.scrollBy(0, speed);
			mouse_y += speed;
			update_box(mouse_x, mouse_y);
			detech(mouse_x, mouse_y, false);
			scroll_bug_ignore = true;
			return;
		} else if (window.scrollY > 0 && y < 20) {
			let speed = y < 2 ? 60 : y < 10 ? 30 : 10;
			window.scrollBy(0, -speed);
			mouse_y -= speed;
			update_box(mouse_x, mouse_y);
			detech(mouse_x, mouse_y, false);
			scroll_bug_ignore = true;
			return;
		}
	}

	clearInterval(scroll_id);
	scroll_id = 0;
}

function detech(x, y, open) {
	mouse_x = x;
	mouse_y = y;

	if (!box_on && (box.x2 - box.x1 >= 5 || box.y2 - box.y1 >= 5)) start();

	if (!scroll_id) scroll_id = setInterval(scroll, 100);

	let count = 0;
	let open_tabs = [];
	let count_tabs = new Set();

	for (let link of links) {
		let inside = !smart_select || link.important;
		inside &&= !(link.x1 > box.x2 || link.x2 < box.x1 || link.y1 > box.y2 || link.y2 < box.y1);

		if (inside) {
			if (open) {
				open_tabs.push({ url: link.href, title: link.innerText });
			}
			if (!smart_select && link.important) {
				smart_select = true;
				return false;
			} else if (link.important) {
				count++;
			}

			if (link.box === null) {
				let link_box = document.createElement("span");
				link_box.style.margin = "0px auto";
				link_box.style.border = "1px solid red";
				link_box.style.position = "absolute";
				link_box.style.width = link.width + "px";
				link_box.style.height = link.height + "px";
				link_box.style.top = link.y1 + "px";
				link_box.style.left = link.x1 + "px";
				link_box.style.zIndex = Z_INDEX;

				document.body.appendChild(link_box);
				link.box = link_box;
			} else {
				link.box.style.visibility = "visible";
			}

			count_tabs.add(link.href);
		} else {
			if (link.box !== null) link.box.style.visibility = "hidden";
		}
	}

	if (smart_select && count === 0) {
		smart_select = false;
		return false;
	}

	count_label.innerText = count_tabs.size;

  console.log("sending activate...")
	if (open_tabs.length > 0) {
		chrome.runtime.sendMessage({
			message: "activate",
			urls: open_tabs,
			setting: settings[setting]
		});
	}

	return true;
}

function allow_key(keyCode) {
	for (var i in settings) {
		if (settings[i].key === keyCode) return true;
	}
	return false;
}

function keydown(event) {
	if (event.keyCode !== END_KEYCODE && event.keyCode !== HOME_KEYCODE) {
		key_pressed = event.keyCode;
		if (os === OS_LINUX && allow_key(key_pressed)) stop_menu = true;
	} else {
		scroll_bug_ignore = true;
	}
}

function blur() {
	remove_key();
}

function keyup(event) {
	if (event.keyCode !== END_KEYCODE && event.keyCode !== HOME_KEYCODE) {
		remove_key();
	}
}

function remove_key() {
	if (os === OS_LINUX) stop_menu = false;
	key_pressed = 0;
}

function allow_selection() {
	for (var i in settings) {
		if (settings[i].mouse === mouse_button && settings[i].key === key_pressed) {
			setting = i;
			if (box !== null) box.style.border = "2px dotted " + settings[i].color;
			return true;
		}
	}
	return false;
}

function contextmenu(event) {
	if (stop_menu) {
		event.preventDefault();
	}
}
