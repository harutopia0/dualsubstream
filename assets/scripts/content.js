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
const data = { init: false, target: null, name: "none", names: [], subs: [], lines: [] }
const time = { current: 0, duration: 0, sync: 0 }
const overlay = {
  version: "1.2",
  outer: { element: document.createElement("div"), style: { all: "initial", width: 0, height: 0, left: 0, top: 0, justifyContent: "center", alignItems: "end", paddingLeft: 65, paddingRight: 65, paddingTop: 86, paddingBottom: 86, pointerEvents: "none", position: "fixed", display: "flex", boxSizing: "border-box" } },
  inner: { element: document.createElement("div"), style: { all: "initial", fontSize: 40, color: "#ffffff", fontWeight: "normal", textAlign: "center", textShadow: "0px 0px 10px #000", backgroundColor: "rgba(0, 0, 0, 0.0)", pointerEvents: "none", borderRadius: 10, padding: "8px 12px", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif" } }
}
const outer = overlay.outer.element
const inner = overlay.inner.element
const outerStyle = overlay.outer.style
const innerStyle = overlay.inner.style
outer.id = "-ext-sub-stream-overlay-outer"
inner.id = "-ext-sub-stream-overlay-inner"
applyStyle(outer, outerStyle)
applyStyle(inner, innerStyle)
outer.appendChild(inner)
const init = () => { data.init = true; update() }
const update = () => {
  if (data.init) { requestAnimationFrame(update) }
  const video = data.target
  if (video) {
    time.current = video.currentTime
    time.duration = video.duration
    const current = time.current - time.sync
    let textBottom = ""
    let textTop = ""
    if (data.subs[0]) {
      const lineBottom = data.subs[0].find(line => line.from <= current && line.to >= current)
      if (lineBottom) textBottom = lineBottom.text
    }
    if (data.subs[1]) {
      const lineTop = data.subs[1].find(line => line.from <= current && line.to >= current)
      if (lineTop) textTop = lineTop.text
    }
    let text = ""
    if (textTop && textBottom) { text = `<div>${textTop}</div><div style="margin-top: 8px;">${textBottom}</div>` }
    else if (textTop) { text = `<div>${textTop}</div>` }
    else if (textBottom) { text = `<div>${textBottom}</div>` }
    if (inner.innerHTML !== text) { inner.innerHTML = text }
    inner.style.display = text !== "" ? "block" : "none"
    const rect = video.getBoundingClientRect()
    applyStyle(outer, { width: rect.width, height: rect.height, left: rect.left, top: rect.top }, outerStyle)
    const parent = video.parentElement
    if (parent && !parent.querySelector("#" + outer.id)) { parent.appendChild(outer) }
  } else {
    inner.style.display = "none"
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
        if (data.subs.length >= 2) {
          data.names[1] = file.name
          data.subs[1] = parseLines(reader.result)
        } else {
          data.names.push(file.name)
          data.subs.push(parseLines(reader.result))
        }
        data.name = data.names.join(" & ") || "none"
        data.lines = data.subs[0] || []
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
      track.label = `DualSubStream ${index === 0 ? 'Bottom' : 'Top'}`
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
    if ("name" in payload) { data.name = payload.name }
    if ("lines" in payload) { data.lines = payload.lines }
    if ("sync" in payload) { time.sync = payload.sync }
    if ("outer" in payload) { applyStyle(outer, payload.outer, outerStyle) }
    if ("inner" in payload) { applyStyle(inner, payload.inner, innerStyle) }
  } else if (action === "upload") {
    await onUpload()
  } else if (action === "remove") {
    const idx = payload.index
    data.names.splice(idx, 1)
    data.subs.splice(idx, 1)
    data.name = data.names.join(" & ") || "none"
    data.lines = data.subs[0] || []
    if (data.names.length === 0) {
      data.init = false
      inner.style.display = "none"
    }
  }
  
  if (action === "stop") {
    data.init = false
    inner.style.display = "none"
    data.name = "none"
    data.names = []
    data.subs = []
    data.lines = []
    sendMessage("data", { data, time, overlay })
  } else if (action === "time") {
    sendMessage("time", { time })
  } else {
    if (!data.init) { init() }
    sendMessage("data", { data, time, overlay })
  }
  callback(true)
})