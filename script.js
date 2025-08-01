let video = document.getElementById('videoInput');
let canvas = document.getElementById('outputCanvas');
let ctx = canvas.getContext('2d');
let nameInput = document.getElementById('nameInput');
let nameListDiv = document.getElementById('nameList');
let names = [];
let colors = [];
let cap, src, gray, blur, thresh, contours, hierarchy;
let streaming = false;
let videoStream = null;
let assignedGrains = [];
const stopBtn = document.getElementById('stop-btn');

const synth = window.speechSynthesis;

function speakName(name) {
  if (synth.speaking) synth.cancel();
  const utterance = new SpeechSynthesisUtterance(name);
  synth.speak(utterance);
}

canvas.addEventListener('click', function (e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  for (let g of assignedGrains) {
    const dist = Math.hypot(g.cx - x, g.cy - y);
    if (dist < 20) {
      speakName(g.name);
      break;
    }
  }
});

function getDistinctColor(index, total) {
  const hue = (index * 360 / total) % 360;
  const color = hsvToRgb(hue, 1, 1);
  return new cv.Scalar(color[2], color[1], color[0], 255);
}

function hsvToRgb(h, s, v) {
  let c = v * s;
  let x = c * (1 - Math.abs((h / 60) % 2 - 1));
  let m = v - c;
  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function onOpenCvReady() {
  console.log("OpenCV.js loaded!");
}

function addParticipant() {
  const name = nameInput.value.trim();
  if (name !== "") {
    names.push(name);
    updateNameList();
    nameInput.value = "";
  }
}

function updateNameList() {
  nameListDiv.innerHTML = "Participants: " + names.join(", ");
}

function startCamera() {
  navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
    video.srcObject = stream;
    video.play();
    streaming = true;
    videoStream = stream;
    cap = new cv.VideoCapture(video);
    processFrame();
  });
  stopBtn.textContent = "Take a Snap Shot";
  canvas.style.display = "block";
  document.getElementById('main-wrapper').classList.add('full-camera');
}

function stopCamera() {
  streaming = false;
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
    videoStream = null;
  }
  if (cap) cap = null;

  const dataURL = canvas.toDataURL("image/png");
  document.getElementById("snapshotPreview").src = dataURL;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  assignedGrains = [];
  stopBtn.textContent = "Stop Camera";
  canvas.style.display = "none";
  document.getElementById('main-wrapper').classList.remove('full-camera');
}

function processFrame() {
  if (!streaming) return;

  src = new cv.Mat(video.height, video.width, cv.CV_8UC4);
  gray = new cv.Mat(); blur = new cv.Mat(); thresh = new cv.Mat();
  contours = new cv.MatVector(); hierarchy = new cv.Mat();

  cap.read(src);
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blur, new cv.Size(7, 7), 0);
  cv.threshold(blur, thresh, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
  cv.bitwise_not(thresh, thresh);

  let kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
  cv.morphologyEx(thresh, thresh, cv.MORPH_OPEN, kernel);

  cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  let validContours = [];
  for (let i = 0; i < contours.size(); ++i) {
    let cnt = contours.get(i);
    let area = cv.contourArea(cnt);
    if (area >= 50 && area <= 1000) {
      validContours.push({ index: i, contour: cnt });
    }
  }

  if (validContours.length === 0) {
    cv.imshow("outputCanvas", src);
    src.delete(); gray.delete(); blur.delete(); thresh.delete(); contours.delete(); hierarchy.delete();
    requestAnimationFrame(processFrame);
    return;
  }

  let newAssignments = [];
  for (let i = 0; i < validContours.length; ++i) {
    let cnt = validContours[i].contour;
    let index = validContours[i].index;
    let M = cv.moments(cnt);
    let cx = M.m10 / M.m00;
    let cy = M.m01 / M.m00;

    let matched = false;
    for (let j = 0; j < assignedGrains.length; j++) {
      let g = assignedGrains[j];
      let dist = Math.hypot(g.cx - cx, g.cy - cy);
      if (dist < 20) {
        newAssignments.push({ cx, cy, name: g.name, color: g.color });
        cv.drawContours(src, contours, index, g.color, 1);
        cv.putText(src, g.name, new cv.Point(cx - 10, cy), cv.FONT_HERSHEY_SIMPLEX, 0.4, new cv.Scalar(255, 255, 255), 1);
        matched = true;
        break;
      }
    }

    if (!matched && names.length > 0) {
      let idx = newAssignments.length % names.length;
      let name = names[idx];
      let color = colors[idx];
      newAssignments.push({ cx, cy, name, color });
      cv.drawContours(src, contours, index, color, 1);
      cv.putText(src, name, new cv.Point(cx - 10, cy), cv.FONT_HERSHEY_SIMPLEX, 0.4, new cv.Scalar(255, 255, 255), 1);
    }
  }

  assignedGrains = newAssignments;
  cv.imshow("outputCanvas", src);

  src.delete(); gray.delete(); blur.delete(); thresh.delete(); contours.delete(); hierarchy.delete();
  requestAnimationFrame(processFrame);
}


function startApp() {
  if (names.length < 1) {
    alert("Please enter at least one participant name.");
    return;
  }
  colors = names.map((_, idx) => getDistinctColor(idx, names.length));
  assignedGrains = [];
  startCamera();
}
// 🟢 Add this function at the end of your script or near your helper functions
// Remove the existing canvas.addEventListener and speakGrain functions
// And replace with these:

canvas.addEventListener('click', function (e) {
  // Log the click event to confirm it's firing
  console.log('Canvas clicked!');
  
  const rect = canvas.getBoundingClientRect();
  
  // Calculate raw click coordinates relative to the top-left of the canvas
  const xRaw = e.clientX - rect.left;
  const yRaw = e.clientY - rect.top;

  // Calculate the scaling factors between the displayed size and the canvas's internal drawing size
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  // Scale the raw click coordinates to the canvas's internal resolution
  const x = xRaw * scaleX;
  const y = yRaw * scaleY;

  // Log the calculated, scaled coordinates
  console.log(`Scaled click coordinates: x=${x}, y=${y}`);
  
  let grainFound = false;

  for (let grain of assignedGrains) {
    const dx = grain.cx - x;
    const dy = grain.cy - y;
    const dist = Math.hypot(dx, dy);

    // Log the grain's details and the distance from the click
    console.log(`Checking grain: name=${grain.name}, cx=${grain.cx}, cy=${grain.cy}, distance=${dist}`);

    if (dist < 20) {
      console.log(`Match found! Calling speakGrain with name: ${grain.name}`);
      speakGrain(grain.name);
      grainFound = true;
      break;
    }
  }
  
  if (!grainFound) {
    console.log('No grain found at this location.');
  }
});


function speakGrain(name) {
  // Log that the function is being called and with what name
  console.log(`speakGrain function called. Name to speak: ${name}`);

  // Check if the browser supports the Web Speech API
  if (!('speechSynthesis' in window)) {
    console.error('Web Speech API is not supported by this browser.');
    return;
  }
  
  const synth = window.speechSynthesis;
  
  // Guard against speaking a non-string or empty name
  if (typeof name !== 'string' || name.trim() === '') {
    console.warn('speakGrain called with an invalid name:', name);
    return;
  }

  const funnyLines =  [
    `${name} reporting for duty, sir!`,
   `Hey! I'm ${name} and I'm feeling grain-tastic!`,
    `Did someone say carbs? I'm ${name}, and I approve this message.`,
    `I'm ${name}... and yes, I'm a little cracked.`,
    `Rice to meet you! I’m ${name}.`,
    `Stop staring! ${name} is shy.`,
    `I’m ${name}, a grain with a brain!`,
    `Don’t boil me, bro! I’m ${name}.`,
    `Hi! ${name} here, living my best grain life.`,
    `Why did the rice cross the plate? To say hi, I’m ${name}!`
  ];


  const utterance = new SpeechSynthesisUtterance();
  utterance.text = funnyLines[Math.floor(Math.random() * funnyLines.length)];
  utterance.lang = 'en-US';
  
  if (synth.speaking) {
    synth.cancel();
  }
  
  synth.speak(utterance);
}
