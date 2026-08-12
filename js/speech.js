// Web Speech API 封装 —— ASR 语音识别 + TTS 语音合成
(function (global) {
  "use strict";

  const SR = global.SpeechRecognition || global.webkitSpeechRecognition;
  const SS = global.speechSynthesis;

  const ASR = {
    rec: null,
    listening: false,
    onResult: null,
    onEnd: null,
    supported: !!SR,

    start(lang = "zh-CN") {
      if (!SR) {
        alert("当前浏览器不支持语音识别(SpeechRecognition)。请使用 Chrome/Edge。");
        return false;
      }
      if (this.listening) {
        this.stop();
        return false;
      }
      const rec = new SR();
      rec.lang = lang;
      rec.continuous = false;
      rec.interimResults = false;
      rec.maxAlternatives = 1;

      rec.onresult = (e) => {
        const text = e.results[0][0].transcript;
        if (this.onResult) this.onResult(text);
      };
      rec.onerror = (e) => {
        console.warn("ASR error:", e.error);
        this.listening = false;
        if (this.onEnd) this.onEnd();
      };
      rec.onend = () => {
        this.listening = false;
        if (this.onEnd) this.onEnd();
      };

      rec.start();
      this.rec = rec;
      this.listening = true;
      return true;
    },

    stop() {
      if (this.rec && this.listening) {
        this.rec.stop();
      }
      this.listening = false;
    }
  };

  const TTS = {
    voices: [],
    voice: null,
    rate: 1,
    speaking: false,
    onBoundary: null,
    onEnd: null,
    onStart: null,
    supported: !!SS,

    loadVoices() {
      if (!SS) return [];
      this.voices = SS.getVoices();
      // 优先选择中文语音
      const zh = this.voices.filter((v) => /zh|cmn/i.test(v.lang));
      if (zh.length) this.voice = zh[0];
      return this.voices;
    },

    setVoice(name) {
      const v = this.voices.find((x) => x.name === name);
      if (v) this.voice = v;
    },

    speak(text, { lang = "zh-CN", rate } = {}) {
      if (!SS) {
        console.warn("TTS not supported");
        if (this.onEnd) this.onEnd();
        return;
      }
      SS.cancel(); // 打断上一句

      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = rate || this.rate;
      if (this.voice) u.voice = this.voice;

      u.onstart = () => {
        this.speaking = true;
        if (this.onStart) this.onStart();
      };
      u.onend = () => {
        this.speaking = false;
        if (this.onEnd) this.onEnd();
      };
      u.onerror = () => {
        this.speaking = false;
        if (this.onEnd) this.onEnd();
      };

      SS.speak(u);
    },

    stop() {
      if (SS) SS.cancel();
      this.speaking = false;
    }
  };

  // Chrome 加载语音有延迟
  if (SS) {
    SS.onvoiceschanged = () => TTS.loadVoices();
    TTS.loadVoices();
  }

  global.ASR = ASR;
  global.TTS = TTS;
})(window);
