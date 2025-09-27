	// === API Config ===
const API_KEY = "AIzaSyAO2-gjqVmFAwWelB0gVe9mEo0yiurAHd4";
const MODEL_NAME = "gemini-2.5-flash-preview-05-20";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;
const MAX_RETRIES = 5;

// === Language state ===
let CURRENT_LANG = "en"; // default language
let VOICE_LANG = "en-IN";

const advisoryPrompts = {
  en: "You are an expert agricultural advisor and crop scientist specializing in pest and disease diagnosis. Your task is to analyze the provided image, identify the potential crop, disease, or pest issue, and offer a preliminary diagnosis and practical, actionable advice for a farmer. Respond clearly and concisely. Format your response with clear sections for 'Diagnosis' and 'Actionable Advice'.",
  hi: "[translate:आप एक कृषि वैज्ञानिक और फसल सलाहकार हैं। कृपया दी गई छवि का विश्लेषण करें, संभावित फसल, रोग या कीट समस्या की पहचान करें, और स्पष्ट, व्यावहारिक सलाह दें। उत्तर 'Diagnosis' और 'Actionable Advice' अनुभागों में स्पष्ट और सरल हिंदी में दें।]",
  pa: "[translate:ਤੁਸੀਂ ਇੱਕ ਮਹਿਰਤਾਸ਼ agricole ਵਿਗਿਆਨੀ ਅਤੇ ਫਸਲ ਸਲਾਹਕਾਰ ਹੋ। ਦਿੱਤੀ ਗਈਆਂ ਛਬੀਆਂ ਦਾ ਵਿਸ਼ਲੇਸ਼ਣ ਕਰੋ, ਸੰਭਾਵਤ ਫਸਲ, ਬਿਮਾਰੀ ਜਾਂ ਕੀੜੇ ਦੀ ਪਹਿਚਾਣ ਕਰੋ ਅਤੇ ਕਿਸਾਨ ਲਈ ਸਪਸ਼ਟ, ਕਾਰਗਰ ਸਲਾਹ ਦਿਓ। ਜਵਾਬ ਨੂੰ 'ਨਿਧਾਨ' ਤੇ 'ਕਿਰਿਆਂਸ਼ੀਲ ਸਲਾਹ' ਵਾਲੇ ਸੈਕਸ਼ਨ ਵਿੱਚ ਸਾਫ ਤੇ ਸੰਖੇਪ ਵਿੱਚ ਦਿਓ।]"
};

const voiceLangCodes = {
  en: "en-IN",
  hi: "hi-IN",
  pa: "pa-IN"
};

// === DOM Elements ===
const langToggle = document.getElementById("lang-toggle");
const imageUpload = document.getElementById("image-upload");
const imagePreview = document.getElementById("image-preview");
const previewPlaceholder = document.getElementById("preview-placeholder");
const userQueryInput = document.getElementById("user-query") || { value: "" };
const diagnoseButton = document.getElementById("diagnose-button") || null;
const buttonText = document.getElementById("button-text") || null;
const loadingIndicator = document.getElementById("loading-indicator") || null;
const diagnosisResult = document.getElementById("diagnosis-result");
const errorMessage = document.getElementById("error-message");
const startVoiceBtn = document.getElementById("start-voice-btn") || document.getElementById("start-voice-btn-ui");
const voiceStatus = document.getElementById("voice-status") || document.getElementById("voice-status-ui");
const speakResponseBtn = document.getElementById("speak-response-btn");
const openCameraBtn = document.getElementById("open-camera-btn");
const cameraContainer = document.getElementById("camera-container");
const cameraVideo = document.getElementById("camera-video");
const capturePhotoBtn = document.getElementById("capture-photo-btn");
const closeCameraBtn = document.getElementById("close-camera-btn");
const sidebar = document.getElementById("sidebar");
const sidebarOpen = document.getElementById("sidebar-open");
const sidebarClose = document.getElementById("sidebar-close");
const mainContent = document.getElementById("main-content");
const tabWeather = document.getElementById("tab-weather");
const weatherContainer = document.getElementById("weather-container");
const weatherInfo = document.getElementById("weather-info");
const tabSchemes = document.getElementById("tab-schemes");
const schemesContainer = document.getElementById("schemes-container");
const schemesList = document.getElementById("schemes-list");

let cameraStream = null;

// Language toggle handler
if (langToggle) {
  langToggle.addEventListener("change", (e) => {
    CURRENT_LANG = e.target.value;
    VOICE_LANG = voiceLangCodes[CURRENT_LANG] || "en-IN";
    if (recognition) recognition.lang = VOICE_LANG;
  });
}

// Helpers
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = (error) => reject(error);
  });
}
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// Gemini API call
async function callGeminiApi(base64Image, mimeType, prompt) {
  const systemPrompt = advisoryPrompts[CURRENT_LANG] || advisoryPrompts.en;
  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }, { inlineData: { mimeType, data: base64Image } }],
      },
    ],
    systemInstruction: { parts: [{ text: systemPrompt }] },
  };

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.status === 429 && attempt < MAX_RETRIES - 1) {
        await sleep(Math.pow(2, attempt) * 1000 + Math.random() * 1000);
        continue;
      }
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed with status ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (!text) throw new Error("No text content found.");
      return text;
    } catch (error) {
      if (attempt === MAX_RETRIES - 1) throw error;
      await sleep(Math.pow(2, attempt) * 1000 + Math.random() * 1000);
    }
  }
}

// Handle diagnosis
async function handleDiagnosis() {
  errorMessage?.classList.add("hidden");
  diagnosisResult.textContent = CURRENT_LANG === "hi"
    ? "[translate:विश्लेषण जारी है, कृपया प्रतीक्षा करें...]"
    : CURRENT_LANG === "pa"
      ? "[translate:ਵਿਸ਼ਲੇਸ਼ਣ ਜਾਰੀ ਹੈ, ਕਿਰਪਾ ਕਰਕੇ ਠਹਿਰੋ...]"
      : "Analyzing image and generating diagnosis...";
  let mimeType, base64Image;

  if (imageUpload?.files?.length > 0) {
    const file = imageUpload.files[0];
    mimeType = file.type;
    base64Image = await fileToBase64(file);
  } else if (imagePreview?.src && imagePreview.style.display !== "none") {
    const m = imagePreview.src.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!m) {
      diagnosisResult.textContent = CURRENT_LANG === "hi"
        ? "[translate:अमान्य छवि डेटा।]"
        : CURRENT_LANG === "pa"
          ? "[translate:ਗਲਤ ਤਸਵੀਰ ਡੇਟਾ।]"
          : "Invalid image data.";
      return;
    }
    mimeType = m[1];
    base64Image = m[2];
  } else {
    diagnosisResult.textContent = CURRENT_LANG === "hi"
      ? "[translate:कृपया सलाह के लिए पहले छवि अपलोड या कैप्चर करें।]"
      : CURRENT_LANG === "pa"
        ? "[translate:ਕਿਰਪਾ ਕਰਕੇ ਸਲਾਹ ਲਈ ਪਹਿਲਾਂ ਤਸਵੀਰ ਅੱਪਲੋਡ ਜਾਂ ਕੈਪਚਰ ਕਰੋ।]"
        : "Please upload or capture an image before diagnosing.";
    return;
  }

  let query = userQueryInput?.value.trim() || "";
  if (!query) {
    diagnosisResult.textContent = CURRENT_LANG === "hi"
      ? "[translate:कृपया समस्या का विवरण या प्रश्न लिखें।]"
      : CURRENT_LANG === "pa"
        ? "[translate:ਕਿਰਪਾ ਕਰਕੇ ਸਮੱਸਿਆ ਦਾ ਵੇਰਵਾ ਜਾਂ ਸਵਾਲ ਲਿਖੋ।]"
        : "Please describe the issue or ask a question in the text box.";
    return;
  }

  if (diagnoseButton) {
    diagnoseButton.disabled = true;
    buttonText.textContent = CURRENT_LANG === "hi"
      ? "[translate:विश्लेषण चल रहा है...]"
      : CURRENT_LANG === "pa"
        ? "[translate:ਵਿਸ਼ਲੇਸ਼ਣ ਚੱਲ ਰਿਹਾ ਹੈ...]"
        : "Diagnosing...";
    loadingIndicator.style.display = "inline-block";
  }

  try {
    const resText = await callGeminiApi(base64Image, mimeType, query);
    diagnosisResult.innerHTML = `<div class="bg-green-50 p-3 rounded-xl text-green-900 whitespace-pre-wrap">${resText}</div>`;
  } catch (error) {
    diagnosisResult.textContent = CURRENT_LANG === "hi"
      ? "[translate:एआई सलाहकार परिणाम देने में सक्षम नहीं है।]"
      : CURRENT_LANG === "pa"
        ? "[translate:ਏਆਈ ਸਲਾਹਕਾਰ ਨਤੀਜਾ ਪ੍ਰਦਾਨ ਕਰਨ ਵਿੱਚ ਅਸਮਰਥ ਹੈ।]"
        : "The AI advisor could not complete the diagnosis.";
    if (errorMessage) {
      errorMessage.textContent = `Error: ${error.message}`;
      errorMessage.classList.remove("hidden");
    }
  } finally {
    if (diagnoseButton) {
      diagnoseButton.disabled = false;
      buttonText.textContent = CURRENT_LANG === "hi"
        ? "[translate:विशेषज्ञ सलाह प्राप्त करें]"
        : CURRENT_LANG === "pa"
          ? "[translate:ਮਾਹਿਰ ਸਲਾਹ ਪ੍ਰਾਪਤ ਕਰੋ]"
          : "Get Expert Diagnosis";
      loadingIndicator.style.display = "none";
    }
  }
}

// Image upload preview
if (imageUpload) {
  imageUpload.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        imagePreview.src = ev.target.result;
        imagePreview.style.display = "block";
        if (previewPlaceholder) previewPlaceholder.style.display = "none";
        if (cameraStream) closeCamera();
      };
      reader.readAsDataURL(file);
    } else {
      imagePreview.style.display = "none";
      if (previewPlaceholder) previewPlaceholder.style.display = "block";
      imagePreview.src = "";
    }
  });
}

// Bind diagnose button
if (diagnoseButton) {
  diagnoseButton.addEventListener("click", handleDiagnosis);
}

// Voice support
let recognition;
function initRecognition() {
  if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = VOICE_LANG;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => voiceStatus?.classList.remove("hidden");
    recognition.onspeechend = () => {
      recognition.stop();
      voiceStatus?.classList.add("hidden");
    };
    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      voiceStatus?.classList.add("hidden");
    };
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      if (userQueryInput) userQueryInput.value = userQueryInput.value ? userQueryInput.value + " " + transcript : transcript;
    };
  } else {
    if (startVoiceBtn) {
      startVoiceBtn.disabled = true;
      startVoiceBtn.title = "Speech Recognition not supported in this browser";
    }
  }
}
initRecognition();

if (startVoiceBtn) {
  startVoiceBtn.addEventListener("click", () => {
    if (!recognition) initRecognition();
    recognition.lang = VOICE_LANG;
    recognition.start();
  });
}

if (speakResponseBtn) {
  speakResponseBtn.addEventListener("click", () => {
    const text = diagnosisResult.textContent.trim();
    if (!text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = VOICE_LANG;
    window.speechSynthesis.speak(utterance);
  });
}

const observer = new MutationObserver(() => {
  const hasText = diagnosisResult.textContent.trim().length > 0 && !diagnosisResult.textContent.includes("Upload an image");
  if (speakResponseBtn) speakResponseBtn.disabled = !hasText;
});
observer.observe(diagnosisResult, { childList: true, subtree: true });

// Camera capture
if (openCameraBtn) {
  openCameraBtn.addEventListener("click", async () => {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (cameraVideo) cameraVideo.srcObject = cameraStream;
      if (cameraContainer) cameraContainer.classList.remove("hidden");
      if (openCameraBtn) openCameraBtn.disabled = true;
      if (diagnosisResult) diagnosisResult.textContent = "";
      if (imagePreview) imagePreview.style.display = "none";
      if (previewPlaceholder) previewPlaceholder.style.display = "block";
      if (imageUpload) imageUpload.value = "";
    } catch {
      alert(CURRENT_LANG === "hi"
        ? "[translate:कृपया कैमरा अनुमति दें या छवि अपलोड करें।]"
        : CURRENT_LANG === "pa"
          ? "[translate:ਕਿਰਪਾ ਕਰਕੇ ਕੈਮਰਾ ਪਹੁੰਚ ਦੀ ਆਗਿਆ ਦਿਓ ਜਾਂ ਤਸਵੀਰ ਅੱਪਲੋਡ ਕਰੋ।]"
          : "Could not access camera. Please allow permissions or try uploading an image.");
    }
  });
}

if (capturePhotoBtn) {
  capturePhotoBtn.addEventListener("click", () => {
    if (!cameraStream || !cameraVideo) return;
    const canvas = document.createElement("canvas");
    canvas.width = cameraVideo.videoWidth;
    canvas.height = cameraVideo.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);
    const imageDataUrl = canvas.toDataURL("image/png");
    if (imagePreview) {
      imagePreview.src = imageDataUrl;
      imagePreview.style.display = "block";
    }
    if (previewPlaceholder) previewPlaceholder.style.display = "none";
    closeCamera();
    if (diagnosisResult) diagnosisResult.textContent = "";
  });
}

if (closeCameraBtn) {
  closeCameraBtn.addEventListener("click", () => {
    closeCamera();
  });
}
function closeCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  if (cameraContainer) cameraContainer.classList.add("hidden");
  if (openCameraBtn) openCameraBtn.disabled = false;
}

// Sidebar toggle
sidebarOpen.addEventListener("click", () => {
  sidebar.classList.add("sidebar-visible");
  sidebarOpen.style.display = "none";
  if (mainContent) mainContent.style.marginLeft = "16rem";
});

sidebarClose.addEventListener("click", () => {
  sidebar.classList.remove("sidebar-visible");
  sidebarOpen.style.display = "block";
  if (mainContent) mainContent.style.marginLeft = "0";
});

// Weather feature
async function loadWeather() {
  if (!weatherInfo) return;
  weatherInfo.textContent = CURRENT_LANG === "hi"
    ? "[translate:ਮੌਸਮ ਜਾਣੂ ਕਰਨ ਦੀ ਪ੍ਰਕਿਰਿਆ...]"
    : CURRENT_LANG === "pa"
      ? "[translate:ਮੌਸਮ ਜਾਣਕਾਰੀ ਲੈ ਰਹੇ ਹਾਂ...]"
      : "Loading weather...";

  try {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=27e4823feb09bb9b98c62808b74d3629`;

          const res = await fetch(url);
          const data = await res.json();

          displayWeather(data);
        },
        (error) => {
          weatherInfo.textContent =
            error.code === error.PERMISSION_DENIED
              ? CURRENT_LANG === "hi"
                ? "[translate:ਪਹੁੰਚ ਮਨਜ਼ੂਰ ਨਹੀਂ ਕੀਤੀ ਗਈ।]"
                : CURRENT_LANG === "pa"
                  ? "[translate:ਅਧਿਕਾਰ ਅਸਵੀਕਾਰ ਕੀਤਾ ਗਿਆ]"
                  : "Location permission denied."
              : CURRENT_LANG === "hi"
                ? "[translate:ਸਥਿਤੀ ਉਪਲਬਧ ਨਹੀਂ ਹੈ।]"
                : CURRENT_LANG === "pa"
                  ? "[translate:ਸਥਿਤੀ ਉਪਲਬਧ ਨਹੀਂ]"
                  : "Location unavailable.";
        }
      );
    } else {
      weatherInfo.textContent = CURRENT_LANG === "hi"
        ? "[translate:ਆਪਣੇ ਬਰਾਊਜ਼ਰ ਵਿੱਚ ਗੀਓਲੋਕੇਸ਼ਨ ਸਮਰਥਿਤ ਨਹੀਂ।]"
        : CURRENT_LANG === "pa"
          ? "[translate:ਅੈਪਣਾ ਬਰਾਊਜ਼ਰ ਜੀਓਲੋਕੇਸ਼ਨ ਦਾ ਸਮਰਥਕ ਨਹੀਂ ਹੈ।]"
          : "Geolocation not supported.";
    }
  } catch {
    weatherInfo.textContent = CURRENT_LANG === "hi"
      ? "[translate:ਮੌਸਮ ਪ੍ਰਾਪਤੀ ਵਿੱਚ ਗਲਤੀ।]"
      : CURRENT_LANG === "pa"
        ? "[translate:ਮੌਸਮ ਪ੍ਰਾਪਤੀ ਵਿੱਚ ਗਲਤੀ।]"
        : "Error getting weather.";
  }
}

function displayWeather(data) {
  if (!data || data.cod !== 200) {
    weatherInfo.textContent = CURRENT_LANG === "hi"
      ? "[translate:ਮੌਸਮ ਜਾਣਕਾਰੀ ਉਪਲਬਧ ਨਹੀਂ।]"
      : CURRENT_LANG === "pa"
        ? "[translate:ਮੌਸਮ ਜਾਣਕਾਰੀ ਉਪਲਬਧ ਨਹੀਂ]"
        : "Weather data unavailable.";
    return;
  }
  const { name, main, weather } = data;
  weatherInfo.innerHTML = `
    <p class="font-semibold text-lg mb-1">${name}</p>
    <p class="capitalize">${weather[0].description}</p>
    <p>${CURRENT_LANG === "hi" ? "[translate:ਤਾਪਮਾਨ]" : CURRENT_LANG === "pa" ? "[translate:ਤਾਪਮਾਨ]" : "Temperature"}: ${main.temp} °C</p>
    <p>${CURRENT_LANG === "hi" ? "[translate:ਅਨੁਭਵ]" : CURRENT_LANG === "pa" ? "[translate:ਅਨੁਭਵ]" : "Feels like"}: ${main.feels_like} °C</p>
    <p>${CURRENT_LANG === "hi" ? "[translate:ਨਮੀ]" : CURRENT_LANG === "pa" ? "[translate:ਨਮੀ]" : "Humidity"}: ${main.humidity}%</p>
  `;
}

tabWeather.addEventListener("click", () => {
  if (weatherContainer) weatherContainer.classList.remove("hidden");
  if (schemesContainer) schemesContainer.classList.add("hidden");
  sidebar.classList.remove("sidebar-visible");
  if (mainContent) mainContent.style.marginLeft = "0";
  loadWeather();
});

// Sarkari Schemes Handlers
function loadSchemes() {
  const schemes = [
    {
      title: "Pradhan Mantri Fasal Bima Yojana",
      url: "https://pmfby.gov.in/",
      desc: "Crop insurance to support farmers against crop loss."
    },
    {
      title: "Pradhan Mantri Kisan Samman Nidhi",
      url: "https://pmkisan.gov.in/",
      desc: "Direct income support of ₹6000/year to eligible farmers."
    },
    {
      title: "PM-KUSUM Yojana",
      url: "https://pmkusum.mnre.gov.in/",
      desc: "Solar pumps for affordable irrigation and reduced costs."
    },
    {
      title: "e-NAM",
      url: "https://www.enam.gov.in/web/",
      desc: "National online agricultural market for transparent produce trade."
    }
  ];

  if (schemesList) {
    schemesList.innerHTML = schemes.map((scheme) => `
      <li>
        <a href="${scheme.url}" target="_blank" class="text-green-700 font-bold hover:underline">${scheme.title}</a><br>
        <span class="text-green-900">${scheme.desc}</span>
      </li>
    `).join('');
  }
}

tabSchemes.addEventListener("click", () => {
  if (schemesContainer) schemesContainer.classList.remove("hidden");
  if (weatherContainer) weatherContainer.classList.add("hidden");
  sidebar.classList.remove("sidebar-visible");
  if (mainContent) mainContent.style.marginLeft = "0";
  loadSchemes();
});