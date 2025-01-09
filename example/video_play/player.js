class MP4Player {
    // 构造函数
    constructor() {
        this.mp4url = './test.mp4';
        this.playButton = null;
        this.videoDecoderInstance = null;
        this.audioDecoderInstance = null;
        this.videoMp4box = null;
        this.videoTrack = null;
        this.audioMp4box = null;
        this.audioTrack = null;
        this.videoFrames = [];
        this.audioFrames = [];
        this.videoWidth = 0;
        this.videoHeight = 0;
        this.videoNBSampleTotal = 0;
        this.AudioNBSampleTotal = 0;
        this.videoCountSample = 0;
        this.AudioCountSample = 0;
        this.videoFrameIndex = 0;
        this.audioFrameIndex = 0;
        this.offscreenCanvas = null;
        this.init();
    }

    // 初始化
    init() {
        this.initVideoDecoder();
        this.initAudioDecoder();
        this.playButton = document.getElementById('play');
        this.playButton.addEventListener('click', () => {
            this.play();
        });
    }

    // 初始化视频
    initVideoDecoder() {
        // 创建mp4box实例
        this.videoMp4box = MP4Box.createFile();
        // 获取mp4文件
        fetch(this.mp4url).then(res => res.arrayBuffer()).then(buffer => {
            buffer.fileStart = 0;
            this.videoMp4box.appendBuffer(buffer);
            this.videoMp4box.flush();
        });
        // 监听mp4box的ready事件
        this.videoMp4box.onReady = (info) => {
            this.videoTrack = info.tracks.find(track => track.type === 'video');
            if (!this.videoTrack) {
                console.error('未找到视频轨道');
                return;
            }
            if (this.videoTrack !== null) {
                this.videoMp4box.setExtractionOptions(this.videoTrack.id, 'video', {
                    nbSamples: 10000
                });
            }

            this.videoNBSampleTotal = this.videoTrack.nb_samples;

            // 设置画布尺寸
            this.videoWidth = this.videoTrack.track_width;
            this.videoHeight = this.videoTrack.track_height;

            const videoConfig = {
                codec: this.videoTrack.codec,
                codedWidth: this.videoTrack.track_width,
                codedHeight: this.videoTrack.track_height,
                description: this.getExtradata()
            };

            // 创建视频解码器
            this.videoDecoderInstance = new VideoDecoder({
                output: (videoFrame) => {
                    createImageBitmap(videoFrame).then((img) => {
                        this.videoFrames.push({
                            img,
                            timestamp: videoFrame.timestamp,
                            duration: videoFrame.duration
                        });
                        videoFrame.close();
                    });
                },
                error: (error) => {
                    console.error('视频解码器错误:', error);
                }
            });
            this.videoDecoderInstance.configure(videoConfig);
            this.videoMp4box.start();
        };
        // 监听mp4box的错误事件
        this.videoMp4box.onError = (error) => {
            console.error('MP4Box 错误:', error);
        };
        // 监听mp4box的onSamples事件
        this.videoMp4box.onSamples = (track_id, ref, samples) => {
            if (track_id === this.videoTrack.id) {
                this.videoMp4box.stop();
                this.countSample += samples.length;

                for (const sample of samples) {
                    const type = sample.is_sync ? 'key' : 'delta';

                    const chunk = new EncodedVideoChunk({
                        type,
                        timestamp: sample.cts,
                        duration: sample.duration,
                        data: sample.data
                    })
                    this.videoDecoderInstance.decode(chunk);
                }
                if (this.videoCountSample === this.videoNBSampleTotal) {
                    this.videoDecoderInstance.flush();
                }
            }
        };
    }

    // 初始化音频解码器
    initAudioDecoder() {
        // 创建mp4box实例
        this.audioMp4box = MP4Box.createFile();
        // 获取mp4文件
        fetch(this.mp4url).then(res => res.arrayBuffer()).then(buffer => {
            buffer.fileStart = 0;
            this.audioMp4box.appendBuffer(buffer);
            this.audioMp4box.flush();
        });
        // 监听mp4box的ready事件
        this.audioMp4box.onReady = (info) => {
            this.audioTrack = info.tracks.find(track => track.type === 'audio');
            if (!this.audioTrack) {
                console.error('未找到音频轨道');
                return;
            }
            if (this.audioTrack !== null) {
                this.audioMp4box.setExtractionOptions(this.audioTrack.id, 'audio', {
                    nbSamples: 10000
                });
            }

            this.AudioNBSampleTotal = this.audioTrack.nb_samples;

            const audioConfig = {
                codec: this.audioTrack.codec,
                sampleRate: this.audioTrack.audio.sample_rate,
                numberOfChannels: this.audioTrack.audio.channel_count
            };
            // 创建音频解码器
            this.audioDecoderInstance = new AudioDecoder({
                output: (audioFrame) => {
                    this.audioFrames.push(audioFrame);
                },
                error: (error) => {
                    console.error('音频解码器错误:', error);
                }
            });
            this.audioDecoderInstance.configure(audioConfig);
            this.audioMp4box.start();
        };
        // 监听mp4box的错误事件
        this.audioMp4box.onError = (error) => {
            console.error('MP4Box 错误:', error);
        };
        // 监听mp4box的onSamples事件
        this.audioMp4box.onSamples = (track_id, ref, samples) => {
            if (track_id === this.audioTrack.id) {
                this.audioMp4box.stop();
                for (const sample of samples) {
                    const type = sample.is_sync ? 'key' : 'delta';

                    const chunk = new EncodedAudioChunk({
                        type,
                        timestamp: sample.cts,
                        duration: sample.duration,
                        data: sample.data,
                        offset: sample.offset
                    });
                    this.audioDecoderInstance.decode(chunk);
                }
                if (this.AudioCountSample === this.AudioNBSampleTotal) {
                    this.audioDecoderInstance.flush();
                }
            }
        };
    }


    // 播放
    play() {
        this.checkVideoAndAudioFrame();
        console.log('视频和音频解码完成，开始播放');

        // 禁用播放按钮
        this.playButton.disabled = true;

        const canvas = document.getElementById('canvas');
        if (this.offscreenCanvas === null) {
            this.offscreenCanvas = canvas.transferControlToOffscreen();
        }
        const app = new PIXI.Application({
            view: this.offscreenCanvas,
            width: this.videoWidth,
            height: this.videoHeight,
            resolution: 1
        });

        const imgContainer = new PIXI.Container();
        app.stage.addChild(imgContainer);

        const spriteFrame = this.videoFrames.map(obj => {
            obj.sprite = PIXI.Sprite.from(obj.img);
            obj.sprite.x = 0;
            obj.sprite.y = 0;
            obj.sprite.width = this.videoWidth;
            obj.sprite.height = this.videoHeight;
            obj.sprite.blendMode = PIXI.BLEND_MODES.NORMAL;
            return obj;
        });

        const audioContext = new AudioContext();

        // 计算总帧数
        let totalFrames = 0;
        for (const frame of this.audioFrames) {
            totalFrames += frame.numberOfFrames;
        }
        console.log('总帧数:', totalFrames);

        // 检查总帧数是否大于 0
        if (totalFrames <= 0 || isNaN(totalFrames)) {
            console.error('总帧数无效:', totalFrames);
            return;
        }

        // 创建音频缓冲区
        const audioBuffer = audioContext.createBuffer(
            this.audioTrack.audio.channel_count,
            totalFrames,
            this.audioTrack.audio.sample_rate
        );

        // 填充音频缓冲区
        let offset = 0;
        for (const frame of this.audioFrames) {
            for (let channel = 0; channel < frame.numberOfChannels; channel++) {
                const channelData = new Float32Array(frame.numberOfFrames);
                frame.copyTo(channelData, { planeIndex: channel });
                audioBuffer.getChannelData(channel).set(channelData, offset);
            }
            offset += frame.numberOfFrames;
        }

        // 创建音频源
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start();

        const startTime = audioContext.currentTime;
        const draw = () => {
            const currentTime = audioContext.currentTime - startTime;
            const frameIndex = Math.floor(currentTime * this.videoTrack.timescale / this.videoTrack.duration * this.videoFrames.length);
            if (frameIndex < this.videoFrames.length) {
                const { sprite } = spriteFrame[frameIndex % this.videoFrames.length];
                imgContainer.removeChildren();
                imgContainer.addChild(sprite);
            }
            requestAnimationFrame(draw);
        };

        draw();

        // 播放结束后启用播放按钮
        source.onended = () => {
            this.playButton.disabled = false;
        };
    }


    // 检查视频和音频帧
    checkVideoAndAudioFrame() {
        if (this.videoFrames.length === 0) {
            console.error('视频解码尚未完成，请稍等');
            return;
        }
        if (this.audioFrames.length === 0) {
            console.error('音频解码尚未完成，请稍等');
            return;
        }
    }

    // 获取extradata信息
    getExtradata() {
        const entry = this.videoMp4box.moov.traks[0].mdia.minf.stbl.stsd.entries[0];
        const box = entry.avcC ?? entry.hvcC ?? entry.vpcC;
        if (box != null) {
            const stream = new DataStream(
                undefined,
                0,
                DataStream.BIG_ENDIAN
            );
            box.write(stream);
            return new Uint8Array(stream.buffer.slice(8));
        }
    }
}

// 检查浏览器支持
document.addEventListener('DOMContentLoaded', () => {
    if ('VideoDecoder' in window && 'AudioDecoder' in window && 'EncodedAudioChunk' in window) {
        new MP4Player();
    } else {
        alert('您的浏览器不支持 WebCodecs API');
    }
});