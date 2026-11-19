// The address is assembled in the browser, never written into the markup.
// Cheap harvesters read HTML and plain text; this is not model-proof, but it
// stops the regex crawlers, which is the whole threat.

(function () {
  "use strict";

  var PARTS = ["cGF1bGxhbmdtZ", "XllckBwcm90b2", "5tYWlsLmNvbQ=="];

  function address() {
    try {
      return atob(PARTS.join(""));
    } catch (err) {
      return "";
    }
  }

  function mailto(subject, body) {
    var to = address();
    if (!to) return "#";
    var q = [];
    if (subject) q.push("subject=" + encodeURIComponent(subject));
    if (body) q.push("body=" + encodeURIComponent(body));
    return "mailto:" + to + (q.length ? "?" + q.join("&") : "");
  }

  function wire() {
    document.querySelectorAll("[data-contact]").forEach(function (node) {
      node.addEventListener("click", function (event) {
        event.preventDefault();
        window.location.href = mailto(node.getAttribute("data-subject") || "");
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }

  window.Contact = { address: address, mailto: mailto };
})();
