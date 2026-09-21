(() => {
  // Replace with your Lemon Squeezy checkout URL after creating the product.
  const CHECKOUT_URL = "https://YOUR-STORE.lemonsqueezy.com/checkout/buy/YOUR-VARIANT-ID";
  const KEY_STORAGE = "hookarena.license";

  const $ = (id) => document.getElementById(id);
  const form = $("form"), runBtn = $("run"), status = $("status"), errorBox = $("error");
  const results = $("results"), ranking = $("ranking"), summary = $("summary"), matrixEl = $("matrix");
  const dialog = $("pro-dialog"), keyInput = $("key"), keyStatus = $("key-status");
  let last = null;

  $("buy").href = CHECKOUT_URL;

  const getKey = () => { try { return localStorage.getItem(KEY_STORAGE) || ""; } catch { return ""; } };
  const setKey = (k) => { try { k ? localStorage.setItem(KEY_STORAGE, k) : localStorage.removeItem(KEY_STORAGE); } catch {} };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const candidates = $("candidates").value.split("\n").map((s) => s.trim()).filter(Boolean);
    const payload = {
      candidates,
      audience: $("audience").value.trim(),
      format: $("format").value,
      goal: $("goal").value,
    };
    if (candidates.length < 3) return showError("Add at least 3 candidates, one per line.");
    const pairs = (candidates.length * (candidates.length - 1)) / 2;
    setBusy(true, `Running ${pairs * 2 + candidates.length} judgments…`);
    hideError();
    try {
      const res = await fetch("/api/rank", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(getKey() ? { "X-License-Key": getKey() } : {}) },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        showError(data.error || `Request failed (${res.status})`);
        if (res.status === 402) status.textContent = "";
        return;
      }
      last = data;
      render(data);
    } catch (err) {
      showError(err.message || "Network error");
    } finally {
      setBusy(false, "");
    }
  });

  function render(data) {
    const { rows, matrix, margin, meta } = data;
    ranking.innerHTML = "";
    rows.forEach((r) => {
      const li = document.createElement("li");
      if (r.rank === 1) li.classList.add("winner");
      const riskPct = r.clickbaitRisk == null ? null : Math.round(r.clickbaitRisk * 100);
      const flag = riskPct == null ? "" : riskPct >= 50
        ? `<span class="flag risk">Clickbait risk ${riskPct}%</span>`
        : `<span class="flag ok">Honest ${100 - riskPct}%</span>`;
      li.innerHTML = `
        <div class="rank">${r.rank}</div>
        <div>
          <div class="text"></div>
          <div class="bar"><span style="width:${Math.round(r.winRate * 100)}%"></span></div>
          ${flag}
        </div>
        <div class="stats"><b>${Math.round(r.winRate * 100)}%</b> win rate<br/>strength ${(r.strength * 100).toFixed(1)}</div>`;
      li.querySelector(".text").textContent = r.text;
      ranking.appendChild(li);
    });

    const marginText = margin == null ? "" : ` Winner beats runner-up ${Math.round(margin * 100)}% of the time.`;
    summary.textContent =
      `${meta.judgments} judgments in ${(meta.ms / 1000).toFixed(1)}s for $${meta.costUsd.toFixed(4)}.` + marginText +
      (meta.remainingToday != null ? ` ${meta.remainingToday} free rankings left today.` : "");

    renderMatrix(rows, matrix);
    results.hidden = false;
    results.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderMatrix(rows, matrix) {
    const order = rows.map((r) => r.index);
    const label = (i) => rows.find((r) => r.index === i).text;
    let html = "<thead><tr><th></th>" + order.map((_, k) => `<th>#${k + 1}</th>`).join("") + "</tr></thead><tbody>";
    order.forEach((i, k) => {
      html += `<tr><th class="rowhead" title="${escapeAttr(label(i))}">#${k + 1} ${escapeHtml(label(i).slice(0, 28))}</th>`;
      order.forEach((j) => {
        if (i === j) { html += "<td>–</td>"; return; }
        const p = matrix[i][j];
        const cls = p >= 0.6 ? "hi" : p <= 0.4 ? "lo" : "";
        html += `<td class="${cls}">${Math.round(p * 100)}</td>`;
      });
      html += "</tr>";
    });
    matrixEl.innerHTML = html + "</tbody>";
  }

  $("copy").addEventListener("click", () => last && copy(last.rows[0].text, "Winner copied"));
  $("share").addEventListener("click", () => {
    if (!last) return;
    const lines = last.rows.map((r) => `${r.rank}. ${r.text}  (${Math.round(r.winRate * 100)}% win rate)`);
    lines.push("", `Ranked by Hook Arena: ${last.meta.judgments} Jev judgments in ${(last.meta.ms / 1000).toFixed(1)}s.`);
    copy(lines.join("\n"), "Results copied");
  });

  $("pro-btn").addEventListener("click", openDialog);
  $("enter-key").addEventListener("click", openDialog);
  function openDialog() {
    keyInput.value = getKey();
    keyStatus.textContent = getKey() ? "A key is saved on this device." : "";
    dialog.showModal();
  }
  $("save-key").addEventListener("click", async () => {
    const key = keyInput.value.trim();
    if (!key) return (keyStatus.textContent = "Paste a key first.");
    keyStatus.textContent = "Checking…";
    try {
      const res = await fetch("/api/license", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
      const data = await res.json();
      if (data.valid) { setKey(key); keyStatus.textContent = "Pro activated on this device."; }
      else keyStatus.textContent = "That key is not active. Check the email from your purchase.";
    } catch { keyStatus.textContent = "Could not reach the server."; }
  });
  $("clear-key").addEventListener("click", () => { setKey(""); keyInput.value = ""; keyStatus.textContent = "Key removed."; });

  function setBusy(busy, text) { runBtn.disabled = busy; status.textContent = text; }
  function showError(msg) { errorBox.textContent = msg; errorBox.hidden = false; }
  function hideError() { errorBox.hidden = true; }
  async function copy(text, done) {
    try { await navigator.clipboard.writeText(text); status.textContent = done; setTimeout(() => (status.textContent = ""), 1500); }
    catch { status.textContent = "Copy failed"; }
  }
  function escapeHtml(s) { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function escapeAttr(s) { return escapeHtml(s); }
})();
