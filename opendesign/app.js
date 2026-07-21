const views = [...document.querySelectorAll("[data-view]")];
const sidebarViews = [...document.querySelectorAll("[data-sidebar]")];
const toast = document.querySelector("#toast");
const toastText = toast?.querySelector("span");

function showToast(message) {
  if (!toast || !toastText) return;
  toastText.textContent = message;
  toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => { toast.hidden = true; }, 2200);
}

function showView(name) {
  views.forEach((view) => { view.hidden = view.dataset.view !== name; });
  sidebarViews.forEach((sidebar) => { sidebar.hidden = sidebar.dataset.sidebar !== name; });
  if (!window.location.hash.startsWith("#figmacapture=")) window.location.hash = name;
  document.querySelector(".workspace-main")?.scrollTo?.({ top: 0 });
}

document.querySelectorAll("[data-view-link]").forEach((control) => {
  control.addEventListener("click", (event) => {
    event.preventDefault();
    showView(control.dataset.viewLink);
  });
});

let sidebarFilter = "all";
let statusFilter = "active";
const projectSearch = document.querySelector("#project-search");
const stageFilter = document.querySelector("#stage-filter");
const riskFilter = document.querySelector("#risk-filter");
const projectRows = () => [...document.querySelectorAll("#project-rows > tr")];

function filterProjects() {
  const query = projectSearch?.value.trim().toLowerCase() || "";
  const stage = stageFilter?.value || "all";
  const risk = riskFilter?.value || "all";
  let visible = 0;

  projectRows().forEach((row) => {
    const matchesSearch = (row.dataset.search || "").toLowerCase().includes(query);
    const matchesSidebar = sidebarFilter === "all" || (row.dataset.filter || "").split(" ").includes(sidebarFilter);
    const matchesStatus = statusFilter === "all" || (row.dataset.status || "").split(" ").includes(statusFilter);
    const matchesStage = stage === "all" || row.dataset.stage === stage;
    const matchesRisk = risk === "all" || row.dataset.risk === risk;
    row.hidden = !(matchesSearch && matchesSidebar && matchesStatus && matchesStage && matchesRisk);
    if (!row.hidden) visible += 1;
  });

  document.querySelector("#grid-empty").hidden = visible !== 0;
  document.querySelector("#visible-project-count").textContent = `${visible} 个项目`;
  document.querySelector("#footer-count").textContent = String(visible);
}

projectSearch?.addEventListener("input", filterProjects);
stageFilter?.addEventListener("change", filterProjects);
riskFilter?.addEventListener("change", filterProjects);

document.querySelectorAll("[data-project-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    sidebarFilter = button.dataset.projectFilter;
    document.querySelectorAll("[data-project-filter]").forEach((item) => item.classList.toggle("active", item === button));
    filterProjects();
  });
});

document.querySelectorAll("[data-status-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    statusFilter = button.dataset.statusFilter;
    document.querySelectorAll("[data-status-filter]").forEach((item) => item.classList.toggle("active", item === button));
    filterProjects();
  });
});

document.querySelector("#clear-filters")?.addEventListener("click", () => {
  projectSearch.value = "";
  stageFilter.value = "all";
  riskFilter.value = "all";
  sidebarFilter = "all";
  statusFilter = "active";
  document.querySelectorAll("[data-project-filter]").forEach((item) => item.classList.toggle("active", item.dataset.projectFilter === "all"));
  document.querySelectorAll("[data-status-filter]").forEach((item) => item.classList.toggle("active", item.dataset.statusFilter === "active"));
  filterProjects();
});

document.querySelector("#project-rows")?.addEventListener("click", (event) => {
  if (event.target.closest("input, button, a, select")) return;
  const row = event.target.closest("tr[data-open-project]");
  if (row) showView("compliance");
});

const projectDialog = document.querySelector("#project-dialog");
const projectForm = document.querySelector("#project-form");
function openProjectDialog() { projectDialog?.showModal(); }
function closeProjectDialog() { projectDialog?.close(); }
document.querySelector("#new-project")?.addEventListener("click", openProjectDialog);
document.querySelector("#sidebar-create")?.addEventListener("click", openProjectDialog);
document.querySelector("#close-project-dialog")?.addEventListener("click", closeProjectDialog);
document.querySelector("#cancel-project-dialog")?.addEventListener("click", closeProjectDialog);

projectForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(projectForm);
  const name = String(formData.get("name") || "新建投标项目");
  const code = String(formData.get("code") || "NEW-2026-001");
  const buyer = String(formData.get("buyer") || "待补充采购人");
  const stage = String(formData.get("stage") || "要求确认");
  const deadline = String(formData.get("deadline") || "").replaceAll("-", ".");
  const row = document.createElement("tr");
  row.dataset.filter = "mine";
  row.dataset.status = "active";
  row.dataset.stage = stage;
  row.dataset.risk = "normal";
  row.dataset.search = `${name} ${buyer} ${code}`;
  row.innerHTML = `<td><input type="checkbox" aria-label="选择${name}" /></td><td><div class="project-name"><strong>${name}</strong><span>${code} · ${buyer}</span></div></td><td><span class="stage"><i class="stage-dot gray"></i>${stage}</span></td><td><span class="plain-status">刚刚创建</span></td><td><span class="evidence"><b>0%</b><small>0 / 0</small></span></td><td><span class="risk-value">0</span></td><td><span class="deadline"><b>${deadline || "待设置"}</b><small>尚未计算</small></span></td><td><span class="owner"><b>李</b>李明</span></td><td>刚刚</td><td><button class="more-button" type="button"><i class="ph ph-dots-three"></i></button></td>`;
  document.querySelector("#project-rows")?.prepend(row);
  projectForm.reset();
  closeProjectDialog();
  filterProjects();
  showToast("项目已创建");
});

const requirementData = {
  iso: { number: "3.1.1", title: "ISO 27001 证书在有效期内", quote: "投标人须提供在有效期内的信息安全管理体系认证证书（ISO/IEC 27001），复印件加盖公章。", type: "资格证明", risk: "致命", owner: "李明", deadline: "07 月 21 日", evidence: "ISO27001证书.pdf", evidenceMeta: "企业材料库 · 第 2 页", page: 21, state: "待人工复核", stateType: "pending" },
  cases: { number: "3.1.2", title: "提供三个同类项目案例", quote: "投标人近三年内应至少具有三个同类数字化建设项目案例，并提供合同关键页及验收证明。", type: "业绩要求", risk: "高", owner: "周颖", deadline: "07 月 22 日", evidence: "同类项目案例汇编.pdf", evidenceMeta: "企业材料库 · 第 3–8 页", page: 32, state: "待人工复核", stateType: "pending" },
  manager: { number: "3.1.3", title: "项目负责人具有五年以上经验", quote: "项目负责人应具有五年以上类似项目管理经验，并提供劳动合同、社保证明及个人履历。", type: "人员要求", risk: "高", owner: "陈嘉", deadline: "07 月 22 日", evidence: "项目经理任职证明.pdf", evidenceMeta: "企业材料库 · 第 1–4 页", page: 35, state: "待人工复核", stateType: "pending" },
  credit: { number: "3.1.4", title: "统一社会信用代码一致", quote: "营业执照、授权委托书及其他资格文件中的统一社会信用代码应保持一致。", type: "主体资质", risk: "一般", owner: "李明", deadline: "07 月 20 日", evidence: "营业执照.pdf", evidenceMeta: "企业材料库 · 第 1 页", page: 17, state: "已确认符合", stateType: "pass" },
  authorization: { number: "3.1.5", title: "法定代表人授权委托书完整", quote: "委托代理人参与投标的，应提供法定代表人签署并加盖公章的授权委托书。", type: "主体资质", risk: "一般", owner: "王骁", deadline: "07 月 20 日", evidence: "授权委托书.pdf", evidenceMeta: "项目材料 · 第 1 页", page: 18, state: "已确认符合", stateType: "pass" },
};

let activeRequirement = "iso";
function applyRequirement(key) {
  const data = requirementData[key];
  if (!data) return;
  activeRequirement = key;
  document.querySelectorAll(".requirement-item").forEach((item) => item.classList.toggle("selected", item.dataset.requirement === key));
  document.querySelector("#drawer-number").textContent = `要求 ${data.number}`;
  document.querySelector("#detail-title").textContent = data.title;
  document.querySelector("#detail-quote").textContent = data.quote;
  document.querySelector("#requirement-type").textContent = data.type;
  document.querySelector("#risk-level").textContent = data.risk;
  document.querySelector("#requirement-owner").textContent = data.owner;
  document.querySelector("#requirement-deadline").textContent = data.deadline;
  document.querySelector("#evidence-name").textContent = data.evidence;
  document.querySelector("#evidence-meta").textContent = data.evidenceMeta;
  document.querySelector("#highlight-text").textContent = data.quote;
  document.querySelector(".highlight-label").textContent = `要求 ${data.number}`;
  document.querySelector("#pdf-page-number").textContent = String(data.page);
  document.querySelector("#page-counter").textContent = `${data.page} / 146`;
  document.querySelector("#document-location").textContent = `第三章 · 第 ${data.page} / 146 页`;
  const state = document.querySelector("#review-state");
  state.className = `review-state ${data.stateType}`;
  state.innerHTML = `<i class="severity ${data.stateType === "pass" ? "green" : data.stateType === "fail" ? "red" : "amber"}"></i>${data.state}`;
  document.querySelectorAll("[data-decision]").forEach((button) => button.classList.toggle("active", button.dataset.decision === data.stateType));
  document.querySelector("#review-note").value = "";
  document.querySelector("#document-canvas")?.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll(".requirement-item").forEach((item) => item.addEventListener("click", () => applyRequirement(item.dataset.requirement)));
document.querySelector("#requirement-search")?.addEventListener("input", (event) => {
  const query = event.currentTarget.value.trim().toLowerCase();
  document.querySelectorAll(".requirement-item").forEach((item) => { item.hidden = !item.textContent.toLowerCase().includes(query); });
});

document.querySelectorAll(".compliance-stats > button").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".compliance-stats > button").forEach((item) => item.classList.toggle("active", item === button));
}));

document.querySelectorAll("[data-decision]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-decision]").forEach((item) => item.classList.toggle("active", item === button));
  });
});

document.querySelector("#save-review")?.addEventListener("click", () => {
  const decision = document.querySelector("[data-decision].active")?.dataset.decision || "pending";
  const data = requirementData[activeRequirement];
  data.stateType = decision;
  data.state = decision === "pass" ? "已确认符合" : decision === "fail" ? "已确认不符合" : "待人工复核";
  applyRequirement(activeRequirement);
  showToast("复核结论已保存");
});

document.querySelector("#locate-source")?.addEventListener("click", () => {
  document.querySelector("#document-highlight")?.scrollIntoView({ behavior: "smooth", block: "center" });
  document.querySelector("#document-highlight")?.animate([{ opacity: .45 }, { opacity: 1 }], { duration: 520, easing: "ease-out" });
});

let zoom = 1;
function setZoom(nextZoom) {
  zoom = Math.min(1.25, Math.max(.8, nextZoom));
  const page = document.querySelector("#pdf-page");
  page.style.transform = `scale(${zoom})`;
  page.style.marginBottom = `${Math.max(0, (zoom - 1) * page.offsetHeight)}px`;
  document.querySelector("#zoom-label").textContent = `${Math.round(zoom * 100)}%`;
}
document.querySelector("#zoom-in")?.addEventListener("click", () => setZoom(zoom + .1));
document.querySelector("#zoom-out")?.addEventListener("click", () => setZoom(zoom - .1));

function changePage(delta) {
  const data = requirementData[activeRequirement];
  data.page = Math.min(146, Math.max(1, data.page + delta));
  document.querySelector("#pdf-page-number").textContent = String(data.page);
  document.querySelector("#page-counter").textContent = `${data.page} / 146`;
  document.querySelector("#document-location").textContent = `第三章 · 第 ${data.page} / 146 页`;
}
document.querySelector("#previous-page")?.addEventListener("click", () => changePage(-1));
document.querySelector("#next-page")?.addEventListener("click", () => changePage(1));
document.querySelector("#reparse")?.addEventListener("click", () => showToast("解析任务已加入队列"));

const evidenceAlternatives = [
  ["ISO27001证书.pdf", "企业材料库 · 第 2 页"],
  ["信息安全管理体系认证.pdf", "企业材料库 · 第 1 页"],
  ["认证证书续期说明.pdf", "项目材料 · 第 3 页"],
];
document.querySelector("#change-evidence")?.addEventListener("click", () => {
  const current = document.querySelector("#evidence-name").textContent;
  const currentIndex = evidenceAlternatives.findIndex(([name]) => name === current);
  const [name, meta] = evidenceAlternatives[(currentIndex + 1) % evidenceAlternatives.length];
  document.querySelector("#evidence-name").textContent = name;
  document.querySelector("#evidence-meta").textContent = meta;
  requirementData[activeRequirement].evidence = name;
  requirementData[activeRequirement].evidenceMeta = meta;
  showToast("已更换匹配证据");
});

const globalSearch = document.querySelector(".global-search input");
globalSearch?.addEventListener("input", () => {
  const projectsVisible = !document.querySelector('[data-view="projects"]').hidden;
  if (projectsVisible) {
    projectSearch.value = globalSearch.value;
    filterProjects();
  } else {
    const requirementInput = document.querySelector("#requirement-search");
    requirementInput.value = globalSearch.value;
    requirementInput.dispatchEvent(new Event("input"));
  }
});

window.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    globalSearch?.focus();
  }
});

document.querySelectorAll(".requirement-tabs button").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".requirement-tabs button").forEach((item) => item.classList.toggle("active", item === button));
}));

const requestedView = new URLSearchParams(window.location.search).get("view");
showView(requestedView === "compliance" || window.location.hash === "#compliance" ? "compliance" : "projects");
filterProjects();
