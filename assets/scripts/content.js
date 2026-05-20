const id = typeof crypto === "object" && typeof crypto.randomUUID === "function" ? `${performance.now()}-${crypto.randomUUID()}-${Math.random()}` : `${performance.now()}-${Math.random()}-${Date.now() * Math.random()}`
function sendMessage(type, data) { chrome.runtime.sendMessage({ id, type, data }).catch(() => { }) }
function toSeconds(time) {
  const [hours, minutes, seconds] = time.split(":")
  const [secs, mill] = seconds.split(",")
  return parseInt(hours, 10) * 3600 + parseInt(minutes, 10) * 60 + parseInt(secs, 10) + parseInt(mill, 10) / 1000
}
function parseLines(text) {
  const lines = text.split(/\r?\n/)
  const output = []
  let current = { from: 0, to: 0, text: "" }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (/^\d+$/.test(line)) {
      current = { from: 0, to: 0, text: "" }
    } else if (line.includes("-->")) {
      const [start, end] = line.split("-->").map(time => time.trim())
      current.from = toSeconds(start)
      current.to = toSeconds(end)
    } else if (line) {
      current.text = (current.text ? current.text + "<br>" : "") + line
    } else if (current.text) {
      output.push(current)
    }
  }
  return output
}
function toVTTTime(seconds) {
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return [hrs.toString().padStart(2, '0'), mins.toString().padStart(2, '0'), secs.toString().padStart(2, '0')].join(':') + '.' + ms.toString().padStart(3, '0')
}
function createVTT(lines) {
  const text = "WEBVTT\n\n" + lines.map(line => {
    const from = toVTTTime(line.from)
    const to = toVTTTime(line.to)
    const text = line.text.replace(/<br\s*\/?>/gi, '\n')
    return `${from} --> ${to}\n${text}`
  }).join("\n\n")
  const blob = new Blob([text], { type: "text/vtt" })
  return URL.createObjectURL(blob)
}
const applyStyle = (element, current, history = null) => {
  const keys = Object.keys(current)
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    const value = current[key]
    if (!history || history[key] !== value) {
      element.style[key] = typeof value === "number" ? `${value}px` : value
      if (history) { history[key] = value }
    }
  }
}

const data = { init: false, target: null, name: "none", names: [null, null], subs: [null, null] }
const time = { current: 0, duration: 0, sync: [0, 0] }

const overlay = {
  version: "2.6", 
  outer: { element: document.createElement("div"), style: { all: "initial", width: 0, height: 0, left: 0, top: 0, justifyContent: "center", alignItems: "end", paddingLeft: 65, paddingRight: 65, paddingTop: 86, paddingBottom: 86, pointerEvents: "none", position: "fixed", display: "flex", flexDirection: "row", boxSizing: "border-box" } },
  stack: { element: document.createElement("div"), style: { display: "flex", flexDirection: "column", gap: "10px", alignItems: "center", pointerEvents: "none" } },
  inner: [
    { element: document.createElement("div"), style: { all: "initial", fontSize: 40, color: "#ffffff", fontWeight: "normal", textAlign: "center", textShadow: "0px 0px 10px #000", backgroundColor: "rgba(0, 0, 0, 0.0)", pointerEvents: "none", borderRadius: 10, padding: "8px 12px", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif" } },
    { element: document.createElement("div"), style: { all: "initial", fontSize: 40, color: "#ffffff", fontWeight: "normal", textAlign: "center", textShadow: "0px 0px 10px #000", backgroundColor: "rgba(0, 0, 0, 0.0)", pointerEvents: "none", borderRadius: 10, padding: "8px 12px", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif" } }
  ]
}

const outer = overlay.outer.element
const outerStyle = overlay.outer.style
const stack = overlay.stack.element
const stackStyle = overlay.stack.style

outer.id = "-ext-sub-stream-overlay-outer"
stack.id = "-ext-sub-stream-overlay-stack"

applyStyle(outer, outerStyle)
applyStyle(stack, stackStyle)

outer.appendChild(stack)
stack.appendChild(overlay.inner[1].element) // Index 1
stack.appendChild(overlay.inner[0].element) // Index 0

overlay.inner.forEach((inn, i) => {
    inn.element.id = `-ext-sub-stream-overlay-inner-${i}`;
    applyStyle(inn.element, inn.style);
});

const init = () => { data.init = true; update() }
const update = () => {
  if (data.init) { requestAnimationFrame(update) }
  const video = data.target
  if (video) {
    time.current = video.currentTime
    time.duration = video.duration
    
    for (let i = 0; i < 2; i++) {
        if (data.subs[i]) {
            const current = time.current - time.sync[i];
            const line = data.subs[i].find(l => l.from <= current && l.to >= current);
            const text = line ? line.text : "";
            if (overlay.inner[i].element.innerHTML !== text) {
                overlay.inner[i].element.innerHTML = text;
            }
            overlay.inner[i].element.style.display = text !== "" ? "block" : "none";
        } else {
            overlay.inner[i].element.style.display = "none";
        }
    }

    const rect = video.getBoundingClientRect()
    applyStyle(outer, { width: rect.width, height: rect.height, left: rect.left, top: rect.top }, outerStyle)
    
    const alignMap = { "start": "flex-start", "center": "center", "end": "flex-end" };
    const horizontalAlign = alignMap[outerStyle.justifyContent] || "center";
    if (stack.style.alignItems !== horizontalAlign) {
        stack.style.alignItems = horizontalAlign;
    }

    const parent = video.parentElement
    if (parent && !parent.querySelector("#" + outer.id)) { parent.appendChild(outer) }
  }
}
const onElement = () => {
  const elements = Array.from(document.querySelectorAll("video"))
  const durations = elements.map(item => item.duration).filter(item => !isNaN(item)).filter(item => item > 10)
  if (durations.length === 0) { return }
  const maximum = Math.max(...durations)
  if (data.target && data.target.duration === maximum) { return }
  data.target = elements.find(item => item.duration === maximum)
}
const onUpload = () => {
  return new Promise(resolve => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".srt"
    input.multiple = false
    input.addEventListener("input", () => {
      const file = input.files[0]
      if (!file) return resolve()
      const reader = new FileReader()
      reader.addEventListener("load", () => {
        if (!data.subs[0]) {
          data.names[0] = file.name
          data.subs[0] = parseLines(reader.result)
        } else if (!data.subs[1]) {
          data.names[1] = file.name
          data.subs[1] = parseLines(reader.result)
        } else {
          data.names[1] = file.name
          data.subs[1] = parseLines(reader.result)
        }
        
        data.name = data.names.filter(Boolean).join(" & ") || "none"
        resolve()
      })
      reader.readAsText(file)
    })
    input.click()
  })
}
document.addEventListener("fullscreenchange", () => {
  const element = document.fullscreenElement
  if (element && element === data.target) {
    data.subs.forEach((subLines, index) => {
      if (!subLines) return;
      const track = document.createElement("track")
      track.kind = "subtitles"
      track.label = `DualSubStream ${index === 0 ? 'Sub 1' : 'Sub 2'}`
      track.default = true
      track.className = "-ext-sub-stream-track"
      track.src = createVTT(subLines)
      data.target.appendChild(track)
    })
  } else {
    const tracks = document.querySelectorAll(".-ext-sub-stream-track")
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i]
      URL.revokeObjectURL(track.src)
      track.remove()
    }
  }
})
chrome.runtime.onMessage.addListener(async (message, _s, callback) => {
  const action = message.action
  const payload = message.payload
  onElement()
  const iframes = document.querySelectorAll("iframe")
  iframes.forEach((iframe) => {
    if (iframe.contentWindow) { iframe.contentWindow.postMessage(message, "*") }
  })
  if (action === "info") {
    sendMessage("info", { target: data.target, duration: data.target ? data.target.duration : 0 })
    return callback(true)
  }
  if (message.id !== id) { return }
  if (action === "update") {
    const subIdx = payload.subIndex ?? 0;
    if ("name" in payload) { data.name = payload.name }
    if ("sync" in payload) { time.sync[subIdx] = payload.sync }
    if ("outer" in payload) { applyStyle(outer, payload.outer, outerStyle) }
    
    if ("inner" in payload && Array.isArray(payload.inner)) {
        applyStyle(overlay.inner[0].element, payload.inner[0], overlay.inner[0].style)
        applyStyle(overlay.inner[1].element, payload.inner[1], overlay.inner[1].style)
    } 
    else if ("inner" in payload) { 
        applyStyle(overlay.inner[subIdx].element, payload.inner, overlay.inner[subIdx].style) 
    }
  } else if (action === "upload") {
    await onUpload()
  } else if (action === "remove") {
    const idx = payload.index
    
    data.names[idx] = null;
    data.subs[idx] = null;
    
    time.sync[idx] = 0;
    overlay.inner[idx].element.style.display = "none";
    overlay.inner[idx].element.innerHTML = "";
    
    data.name = data.names.filter(Boolean).join(" & ") || "none"
    if (data.names.filter(Boolean).length === 0) {
      data.init = false
    }
  }
  
  if (action === "stop") {
    data.init = false
    overlay.inner.forEach(inn => {
      inn.element.style.display = "none";
      inn.element.innerHTML = "";
    });
    data.name = "none"
    data.names = [null, null]
    data.subs = [null, null]
    time.sync = [0, 0]
    sendMessage("data", { data, time, overlay })
  } else if (action === "time") {
    sendMessage("time", { time })
  } else {
    if (!data.init) { init() }
    sendMessage("data", { data, time, overlay })
  }
  callback(true)
})