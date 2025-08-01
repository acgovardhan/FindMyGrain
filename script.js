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

const stopBtn = document.getElementById('stop-btn')

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
  canvas.style.display="block";
  document.getElementById('main-wrapper').classList.add('full-camera');
  //canvas.classList.remove('canvas-expanded');
}

function stopCamera() {
  streaming = false;

  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
    videoStream = null;
  }

  if (cap) cap = null;

  const dataURL = canvas.toDataURL("image/png");
  const previewImg = document.getElementById("snapshotPreview");
  previewImg.src = dataURL;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  assignedGrains = [];
  stopBtn.textContent = "Stop Camera";
  canvas.style.display="none";
  document.getElementById('main-wrapper').classList.remove('full-camera');
  //canvas.classList.remove('canvas-expanded');
}


function processFrame() {
  if (!streaming) return;

  src = new cv.Mat(video.height, video.width, cv.CV_8UC4);
  gray = new cv.Mat();
  blur = new cv.Mat();
  thresh = new cv.Mat();
  contours = new cv.MatVector();
  hierarchy = new cv.Mat();

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
        //let rect = cv.boundingRect(cnt);
        //cv.rectangle(src, new cv.Point(rect.x, rect.y), new cv.Point(rect.x + rect.width, rect.y + rect.height), color, 2);
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
      //let rect = cv.boundingRect(cnt);
      //cv.rectangle(src, new cv.Point(rect.x, rect.y), new cv.Point(rect.x + rect.width, rect.y + rect.height), color, 2);

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