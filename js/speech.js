// Web Speech API 封装 —— ASR 语音识别 + TTS 语音合成
// 移动端适配：iOS Safari / Android Chrome / 微信浏览器
(function (global) {
  "use strict";

  const SR = global.SpeechRecognition || global.webkitSpeechRecognition;
  const SS = global.speechSynthesis;

  const IS_MOBILE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const IS_HTTPS = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";

  const ASR = {
    rec: null,
    listening: false,
    onResult: null,
    onEnd: null,
    onError: null,
    supported: !!SR,
    errorMsg: "",

    start(lang = "zh-CN") {
      this.errorMsg = "";
      if (!SR) {
        this.errorMsg = "当前浏览器不支持语音识别。iOS 请使用 Safari，Android 请使用 Chrome。";
        if (global.confirm) alert(this.errorMsg);
        return false;
      }
      if (!IS_HTTPS) {
        this.errorMsg = "语音识别需要 HTTPS 协议或 localhost 环境。当前协议：" + location.protocol;
        if (global.confirm) alert(this.errorMsg);
        return false;
      }
      if (this.listening) {
        this.stop();
        return false;
      }

      try {
        const rec = new SR();
        rec.lang = lang;
        rec.continuous = IS_IOS;
        rec.interimResults = false;
        rec.maxAlternatives = 1;

        rec.onstart = () => {
          this.listening = true;
        };

        rec.onresult = (e) => {
          const result = e.results[e.results.length - 1];
          if (result && result.isFinal) {
            const text = result[0].transcript;
            if (this.onResult) this.onResult(text);
          }
        };

        rec.onerror = (e) => {
          const err = e.error || "unknown";
          switch (err) {
            case "not-allowed":
              this.errorMsg = "麦克风权限被拒绝。请在浏览器设置中允许访问麦克风。";
              break;
            case "service-not-allowed":
              this.errorMsg = "语音服务不可用。请确保使用 HTTPS 或 localhost 访问。";
              break;
            case "no-speech":
              this.errorMsg = "未检测到语音，请重试。";
              break;
            case "audio-capture":
              this.errorMsg = "未检测到麦克风设备。";
              break;
            case "network":
              this.errorMsg = "网络错误，语音识别需要联网。";
              break;
            default:
              this.errorMsg = "语音识别错误：" + err;
          }
          this.listening = false;
          if (this.onError) this.onError(this.errorMsg);
          if (this.onEnd) this.onEnd();
        };

        rec.onend = () => {
          this.listening = false;
          if (this.onEnd) this.onEnd();
        };

        rec.start();
        this.rec = rec;
        return true;
      } catch (err) {
        this.errorMsg = "启动语音识别失败：" + err.message;
        this.listening = false;
        if (this.onError) this.onError(this.errorMsg);
        return false;
      }
    },

    stop() {
      if (this.rec && this.listening) {
        try { this.rec.stop(); } catch (_) {}
      }
      this.listening = false;
    },

    cancel() {
      if (this.rec) {
        try { this.rec.abort(); } catch (_) {}
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
      SS.cancel();

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

  if (SS) {
    SS.onvoiceschanged = () => TTS.loadVoices();
    TTS.loadVoices();
  }

  global.ASR = ASR;
  global.TTS = TTS;
  global.IS_MOBILE = IS_MOBILE;
  global.IS_IOS = IS_IOS;
  global.IS_HTTPS = IS_HTTPS;
})(window);
