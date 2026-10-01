/* =========================================================
 * UI · 战斗日志
 * ========================================================= */
"use strict";

const Log = {
  add(html, cls = "") {
    const list = document.getElementById("log-list");
    const div = document.createElement("div");
    div.className = "log-line " + cls;
    div.innerHTML = html;
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
  },

  clear() { document.getElementById("log-list").innerHTML = ""; }
};
