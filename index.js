const qs = selector => document.querySelector(selector)
const qa = selector => document.querySelectorAll(selector)

function toTimeString(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = parseInt(seconds % 60)
  const ph = h.toString().padStart(2, "0")
  const pm = m.toString().padStart(2, "0")
  const ps = s.toString().padStart(2, "0")
  return `${ph}:${pm}:${ps}`
}

const exceptions = ["about:", "chrome://", "chrome-extension://", "https://chrome.google.com/webstore"]

const sendMessage = (action, payload = null) => {
  return new Promise(resolve => {
    const message = { id: states.iframe ? states.iframe.id : null, action, payload }
    if (action !== "info" && !states.iframe) { return }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) { return resolve(false) }
      const activeTab = tabs[0]
      if (!activeTab.url) { return resolve(false) }
      if (exceptions.some(part => activeTab.url.startsWith(part))) { return resolve(false) }
      chrome.tabs.sendMessage(activeTab.id, message).then(data => resolve(data)).catch(() => resolve(false))
    })
  })
}

const states = { tab: "upload", lines: [], time: null, iframe: null }

chrome.runtime.onMessage.addListener(message => {
  if (!message) { return }
  const type = message.type
  if (type === "info") {
    const id = message.id
    const data = message.data
    if (states.iframe === null && data.target) {
      if (data.duration > 60) {
        qs(".upload-tray").classList.add("ready")
        document.body.setAttribute("data-ready", "true")
        states.iframe = { id, duration: data.duration }
        const settings = JSON.parse(localStorage.getItem("settings") || "null")
        if (settings && settings.version === "1.2") {
          sendMessage("update", { outer: settings.outer.style, inner: settings.inner.style }).then(onInit)
        } else {
          sendMessage("data").then(onInit)
        }
      }
    }
    return
  }
  
  if (!message.data) return;
  const data = message.data.data
  const time = message.data.time
  const overlay = message.data.overlay
  
  if (type === "data") {
    if (states.tab === "upload") { onTiming(data.lines) }
    
    const isLoaded = data.names && data.names.length > 0;
    qs(".section.upload").setAttribute("data-name", isLoaded ? "none" : "none"); // Giữ nguyên theo code gốc nhưng có thể có nhầm lẫn logic "none", tôi tôn trọng code ban đầu
    qs(".section.upload").setAttribute("data-name", isLoaded ? "loaded" : "none");
    
    const listContainer = qs(".upload-preview-list");
    if (listContainer) {
      if (isLoaded) {
        listContainer.innerHTML = data.names.map((n, i) => 
          `<div class="sub-item">
             <div class="sub-name-item"><span style="color:${i === 0 ? '#423ee0' : '#9b8ff3'}; margin-right: 5px;">[Sub ${i + 1}]</span>${n}</div>
             <button class="remove-btn" data-index="${i}">Remove</button>
           </div>`
        ).join('')
        qa(".remove-btn").forEach(btn => {
          btn.addEventListener("click", (e) => {
            const idx = parseInt(e.currentTarget.getAttribute("data-index"))
            sendMessage("remove", { index: idx })
          })
        })
      } else {
        listContainer.innerHTML = ""
      }
    }

    if (states.tab !== "settings") {
      const outerStyle = overlay.outer.style
      const innerStyle = overlay.inner.style
      qs("#spacing-x").value = outerStyle.paddingLeft
      qs("#spacing-y").value = outerStyle.paddingTop
      qs("[data-position]").setAttribute("data-position", `${outerStyle.alignItems}-${outerStyle.justifyContent}`)
      qs("#font-size").value = innerStyle.fontSize
      qs("#text-color").value = innerStyle.color
      qs("[data-weight]").setAttribute("data-weight", innerStyle.fontWeight)
      qs("#text-shadow").value = parseInt(innerStyle.textShadow.split(" ")[2])
      qs("#background-opacity").value = innerStyle.backgroundColor.split(/[,)]/g)[3] * 100
    }
    if (states.tab !== "timing") {
      qs("#sync").value = message.data.time.sync
    }
    localStorage.setItem("settings", JSON.stringify(overlay))
  } else if (type === "time") {
    onTimingUpdate(time)
    if (states.tab !== "timing") { qs("#sync").value = message.data.time.sync }
  }
  qs(".upload-preview-time").innerHTML = `${toTimeString(time.current)} / ${toTimeString(time.duration)}`
})

qs(".upload-tray").addEventListener("click", () => sendMessage("upload"))

Array.from(qa(".tab")).forEach(tab => {
  tab.addEventListener("click", () => {
    states.tab = tab.classList[1]
    document.body.setAttribute("data-tab", states.tab)
  })
})

const onTiming = lines => {
  states.lines = lines
  const container = qs(".timing-lines")
  container.innerHTML = ""
  if (!lines) return;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const item = document.createElement("div")
    item.className = "timing-line"
    item.innerHTML = line.text.replace(/<br>/g, " ")
    item.innerHTML = item.innerText
    const outer = document.createElement("div")
    outer.className = "timing-line-outer"
    outer.addEventListener("click", () => {
      if (!states.time) { return }
      const amount = (states.time.current - line.from).toFixed(4)
      qs("#sync").value = amount
      sendMessage("update", { sync: amount })
    })
    outer.appendChild(item)
    container.appendChild(outer)
  }
}

const onTimingUpdate = time => {
  states.time = time
  const items = qa(".timing-line")
  if (!states.lines) return;
  for (let i = 0; i < states.lines.length; i++) {
    const line = states.lines[i]
    const item = items[i]
    if (!item) continue;
    const current = time.current - time.sync
    if (line.from <= current && line.to >= current) {
      const amount = (current - line.from) / (line.to - line.from)
      item.classList.add("active")
      item.classList.remove("done")
      item.style.boxShadow = `inset ${400 * amount}px 0px 0px 0px #000`
    } else if (line.from < current) {
      item.classList.add("done")
      item.classList.remove("active")
      item.style.boxShadow = "none"
    } else {
      item.classList.remove("done")
      item.classList.remove("active")
      item.style.boxShadow = "none"
    }
  }
}

const onSettings = event => {
  const target = event.target
  if (!target.value) { return }
  const key = target.id
  const value = target.value.toLowerCase()
  if (key === "font-size") {
    sendMessage("update", { inner: { fontSize: parseInt(value) } })
  } else if (key === "text-color") {
    sendMessage("update", { inner: { color: value } })
  } else if (key === "font-weight") {
    qs("[data-weight]").setAttribute("data-weight", value)
    sendMessage("update", { inner: { fontWeight: value } })
  } else if (key === "text-shadow") {
    sendMessage("update", { inner: { textShadow: `0px 0px ${value}px #000` } })
  } else if (key === "background-opacity") {
    sendMessage("update", { inner: { backgroundColor: `rgba(0, 0, 0, ${value / 100})` } })
  } else if (key === "spacing-x") {
    sendMessage("update", { outer: { paddingLeft: parseInt(value), paddingRight: parseInt(value) } })
  } else if (key === "spacing-y") {
    sendMessage("update", { outer: { paddingTop: parseInt(value), paddingBottom: parseInt(value) } })
  } else if (key === "position") {
    qs("[data-position]").setAttribute("data-position", value)
    sendMessage("update", {
      outer: { alignItems: value.split("-")[0], justifyContent: value.split("-")[1] },
      inner: { textAlign: { start: "left", center: "center", end: "right" }[value.split("-")[1]] }
    })
  }
}

qs("#settings").addEventListener("input", onSettings)
qs("#settings").addEventListener("click", onSettings)

qs("#sync").addEventListener("input", event => {
  const value = event.target.value.toString()
  const amount = (parseFloat(value) || 0).toFixed(4)
  sendMessage("update", { sync: amount })
})

const onInit = () => setInterval(() => sendMessage("time"), 100)

const checkLoop = () => {
  sendMessage("info").then(() => {
    setTimeout(() => { if (!states.iframe) { checkLoop() } }, 100)
  })
}

checkLoop()