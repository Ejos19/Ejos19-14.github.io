const dock = document.getElementById("dock");
const pathEl = document.getElementById("dock-path");
const bead = document.getElementById("bead");
const tabs = document.querySelectorAll(".tab");

const mainTitle = document.getElementById("main-title");
const mainSubtitle = document.getElementById("main-subtitle");
const mainDisplay = document.getElementById("main-display");

// Geometría estricta del dock
const dockWidth = 400;
const dockHeight = 70;
const cornerRadius = 35; // Radio de los extremos

// Dimensiones del hueco (Meniscus)
const notchWidth = 33; // Mitad del ancho total del hueco (Total = 66)
const notchDepth = 23; // Profundidad de caída

// Sincronización perfecta: el padding coincide con el radio de la esquina
// Esto garantiza que el hueco NUNCA rompa las esquinas redondeadas.
const padding = cornerRadius;
const usableWidth = dockWidth - padding * 2; // 400 - 70 = 330
const tabWidth = usableWidth / tabs.length; // 330 / 5 = 66 (El hueco cabe perfecto)

let currentX = getTabCenterX(0);
let targetX = currentX;
let isDragging = false;

// Configuración inicial
updateContent(tabs[0]);

// Función para obtener el centro exacto de cada botón
function getTabCenterX(index) {
  return padding + tabWidth * index + tabWidth / 2;
}

// Curva paramétrica Bézier con suavizado continuo (C1 Continuity)
function getPath(cx) {
  const w = dockWidth;
  const h = dockHeight;
  const r = cornerRadius;
  const nw = notchWidth;
  const nd = notchDepth;

  // Clamping de seguridad (matemáticamente ya no debería chocar gracias a los anchos)
  cx = Math.max(r + nw, Math.min(w - r - nw, cx));

  // Puntos de control Bézier al 50% para una entrada súper suave y sin picos
  const cpX = nw * 0.5;

  return `
        M ${r} 0
        L ${cx - nw} 0
        C ${cx - cpX} 0, ${cx - cpX} ${nd}, ${cx} ${nd}
        C ${cx + cpX} ${nd}, ${cx + cpX} 0, ${cx + nw} 0
        L ${w - r} 0
        A ${r} ${r} 0 0 1 ${w} ${r}
        L ${w} ${h - r}
        A ${r} ${r} 0 0 1 ${w - r} ${h}
        L ${r} ${h}
        A ${r} ${r} 0 0 1 0 ${h - r}
        L 0 ${r}
        A ${r} ${r} 0 0 1 ${r} 0 Z
    `;
}

// Bucle de animación (Lerp fluido)
function animate() {
  // Interpolación para movimiento orgánico
  currentX += (targetX - currentX) * 0.18;

  // Actualizar curvatura SVG
  pathEl.setAttribute("d", getPath(currentX));

  // Desplazamiento de la bola (Diámetro 48px -> Offset 24px)
  bead.style.transform = `translate3d(${currentX - 24}px, 0, 0)`;

  requestAnimationFrame(animate);
}
animate();

function updateContent(tabElement) {
  const color = tabElement.getAttribute("data-color");
  const title = tabElement.getAttribute("data-title");
  const subtitle = tabElement.getAttribute("data-subtitle");
  const iconSvg = tabElement.innerHTML;

  document.documentElement.style.setProperty("--accent", color);
  bead.style.backgroundColor = color;

  mainTitle.innerText = title;
  mainSubtitle.innerText = subtitle;

  mainDisplay.innerHTML = iconSvg;
  const displayIcon = mainDisplay.querySelector("svg");
  if (displayIcon) {
    displayIcon.style.stroke = color;
    displayIcon.style.width = "36px";
    displayIcon.style.height = "36px";
  }
}

tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => {
    if (isDragging) return;
    setTabActive(index);
  });
});

function setTabActive(index) {
  tabs.forEach((t) => t.classList.remove("active"));
  tabs[index].classList.add("active");
  targetX = getTabCenterX(index);
  updateContent(tabs[index]);
}

// Gestión de Arrastre (Drag)
dock.addEventListener("pointerdown", (e) => {
  isDragging = true;
  dock.setPointerCapture(e.pointerId);
  handleDrag(e);
});

dock.addEventListener("pointermove", (e) => {
  if (!isDragging) return;
  handleDrag(e);

  const closestIndex = getNearestTabIndex(targetX);
  tabs.forEach((t, i) => {
    if (i === closestIndex) {
      t.classList.add("active");
      updateContent(t);
    } else {
      t.classList.remove("active");
    }
  });
});

dock.addEventListener("pointerup", (e) => {
  if (!isDragging) return;
  isDragging = false;
  dock.releasePointerCapture(e.pointerId);
  snapToNearestTab();
});

function handleDrag(e) {
  const rect = dock.getBoundingClientRect();
  let x = e.clientX - rect.left;
  const firstX = getTabCenterX(0);
  const lastX = getTabCenterX(tabs.length - 1);
  // Limitar el arrastre exactamente desde el primer hasta el último botón
  x = Math.max(firstX, Math.min(lastX, x));
  targetX = x;
}

function getNearestTabIndex(x) {
  let closestIndex = Math.round((x - padding - tabWidth / 2) / tabWidth);
  return Math.max(0, Math.min(tabs.length - 1, closestIndex));
}

function snapToNearestTab() {
  const closestIndex = getNearestTabIndex(targetX);
  setTabActive(closestIndex);
}
