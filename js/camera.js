// Kamera: jedno zdjęcie na żądanie (kamera nie działa w tle).
(function (AA) {
  AA.Camera = {
    // Zwraca obraz JPEG jako data URL (najdłuższy bok maks. 768 px – mniej tokenów dla AI).
    async snap() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('przeglądarka nie daje dostępu do kamery');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      try {
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        await video.play();
        await AA.sleep(700); // kamera potrzebuje chwili na ustawienie jasności
        const w = video.videoWidth, h = video.videoHeight;
        if (!w || !h) throw new Error('kamera nie zwróciła obrazu');
        const scale = Math.min(1, 768 / Math.max(w, h));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.8);
      } finally {
        stream.getTracks().forEach((t) => t.stop());
      }
    },
  };
})(window.AA);
