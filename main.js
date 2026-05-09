const indicator = document.getElementById('duck-indicator')
const statusText = document.getElementById('status-text')
const toggleBtn = document.getElementById('toggle-btn')
const errorText = document.getElementById('error-text')

let detector = null

class SmartVoiceDetector {
  constructor(options = {}) {
    this.threshold = options.threshold ?? -50
    this.silenceDelay = options.silenceDelay ?? 700
    this.onSpeechStart = options.onSpeechStart || (() => {})
    this.onSpeechEnd = options.onSpeechEnd || (() => {})

    this.isSpeaking = false
    this.timeout = null
    this.audioContext = null
    this.running = false
  }

  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    this.audioContext = new AudioContext()
    const source = this.audioContext.createMediaStreamSource(stream)
    const analyser = this.audioContext.createAnalyser()

    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.4
    source.connect(analyser)

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Float32Array(bufferLength)

    const sampleRate = this.audioContext.sampleRate
    const minHz = 85
    const maxHz = 3000
    const minIndex = Math.floor(minHz / (sampleRate / analyser.fftSize))
    const maxIndex = Math.ceil(maxHz / (sampleRate / analyser.fftSize))

    this.running = true
    const check = () => {
      if (!this.running) return

      analyser.getFloatFrequencyData(dataArray)

      let maxVolume = -Infinity
      for (let i = minIndex; i <= maxIndex; i++) {
        if (dataArray[i] > maxVolume) maxVolume = dataArray[i]
      }

      if (maxVolume > this.threshold) {
        if (!this.isSpeaking) {
          this.isSpeaking = true
          this.onSpeechStart()
        }
        clearTimeout(this.timeout)
        this.timeout = null
      } else if (this.isSpeaking && !this.timeout) {
        this.timeout = setTimeout(() => {
          this.isSpeaking = false
          this.onSpeechEnd()
        }, this.silenceDelay)
      }

      requestAnimationFrame(check)
    }

    check()
  }

  stop() {
    this.running = false
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
  }
}

toggleBtn.addEventListener('click', async () => {
  if (detector) {
    detector.stop()
    detector = null
    statusText.textContent = 'Stopped'
    toggleBtn.textContent = 'Start'
    indicator.classList.remove('speaking')
    indicator.classList.add('silent')
    return
  }

  toggleBtn.disabled = true
  statusText.textContent = 'Starting...'

  try {
    detector = new SmartVoiceDetector({
      threshold: -50,
      onSpeechStart: () => {
        indicator.classList.remove('silent')
        indicator.classList.add('speaking')
        statusText.textContent = 'Voice detected'
      },
      onSpeechEnd: () => {
        indicator.classList.remove('speaking')
        indicator.classList.add('silent')
        statusText.textContent = 'Listening...'
      },
    })

    await detector.start()
    statusText.textContent = 'Listening...'
    toggleBtn.textContent = 'Stop'
    toggleBtn.disabled = false
  } catch (err) {
    console.error('Mic error:', err)
    errorText.textContent = err.message || String(err)
    errorText.classList.remove('hidden')
    statusText.textContent = 'Error'
    toggleBtn.textContent = 'Retry'
    toggleBtn.disabled = false
  }
})