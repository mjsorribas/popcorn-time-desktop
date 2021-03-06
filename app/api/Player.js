import { remote } from 'electron';
import plyr from 'plyr';
import $ from 'jquery';
import childProcess from 'child_process';
import vlcCommand from 'vlc-command';


export default class Player {

  currentPlayer = 'plyr';

  powerSaveBlockerId = 0;

  intervalId = 0;

  static nativePlaybackFormats = ['mp4', 'ogg', 'mov', 'webmv'];

  static experimentalPlaybackFormats = ['mkv', 'wmv', 'avi'];

  /**
   * Cleanup all traces of the player UI
   */
  destroy() {
    clearInterval(this.intervalId);

    switch (this.currentPlayer) {
      case 'plyr':
        if (document.querySelector('.plyr')) {
          if (document.querySelector('.plyr').plyr) {
            document.querySelector('.plyr').plyr.destroy();
          }
        }
        break;
      case 'WebChimera':
        if (document.querySelector('.plyr')) {
          if (document.querySelector('.plyr').plyr) {
            document.querySelector('.plyr').plyr.destroy();
          }
        }
        if (this.player) {
          this.player.close();
        }
        remote.powerSaveBlocker.stop(this.powerSaveBlockerId);
        break;
      default:
        throw new Error('No player available');
    }
  }

  /**
   * Reset they player's state
   */
  reset() {
    clearInterval(this.intervalId);

    switch (this.currentPlayer) {
      case 'plyr':
        this.player.restart();
        break;
      case 'WebChimera':
        this.player.restart();
        break;
      default:
    }
  }

  constructSource(streamingUrl, metadata) {
    clearInterval(this.intervalId);

    const defaultSource = {
      type: 'video',
      sources: [{
        src: streamingUrl,
        type: 'video/mp4'
      }]
    };

    return 'title' in metadata
      ? { ...defaultSource, title: metadata.title }
      : defaultSource;
  }

  static isFormatSupported(filename, mimeTypes) {
    return !! mimeTypes
      .find(mimeType => filename.toLowerCase().includes(mimeType));
  }

  initPlyr(streamingUrl, metadata = {}) {
    this.currentPlayer = 'plyr';

    const player = plyr.setup({
      autoplay: true,
      storage: { enabled: false },
      volume: 10
    })[0].plyr;

    player.source(this.constructSource(streamingUrl, metadata));

    return player;
  }

  initWebChimeraPlayer(streamingUrl, metadata = {}) {
    this.currentPlayer = 'WebChimera';

    const player = plyr.setup({
      autoplay: false,
      volume: 0,
      storage: { enabled: false },
      controls: ['play-large', 'play', 'progress', 'current-time', 'captions', 'fullscreen']
    })[0].plyr;

    player.toggleMute();

    player.source(this.constructSource(streamingUrl, metadata));

    const element = document.createElement('canvas');
    element.style.display = 'none';

    const wcjsPlayer = require('wcjs-prebuilt'); // eslint-disable-line
    const renderer = require('wcjs-renderer'); // eslint-disable-line

    const vlc = wcjsPlayer.createPlayer(['-vvv']);

    renderer.bind(element, vlc);

    const width = $('.container').width();

    document.querySelector('video').style.display = 'none';
    document.querySelector('.plyr__video-wrapper').appendChild(element);
    element.style.display = 'initial';
    $('canvas').width(width);

    vlc.play(streamingUrl);

    //
    // Event bindings
    //
    document.querySelector('.plyr').addEventListener('pause', () => vlc.pause());
    document.querySelector('.plyr').addEventListener('play', () => vlc.play());
    document.querySelector('.plyr').addEventListener('enterfullscreen',
      () => $('canvas').width($('body').width())
    );
    document.querySelector('.plyr').addEventListener('exitfullscreen',
      () => $('canvas').width(width)
    );
    document.querySelector('.plyr').addEventListener('seeking', () => {
      vlc.time = player.getCurrentTime() * 1000; // eslint-disable-line
    });
    document.querySelector('.plyr').addEventListener('mousemove', () => {
      $('canvas').css({ cursor: 'initial' });
    });

    this.intervalId = setInterval(() => {
      if ($('canvas').is(':hover')) {
        $('canvas').css({ cursor: 'none' });
      }
    }, 5000);

    vlc.events.on('Playing', () => {
      console.log('playing...');
      player.play();

      // Prevent display from sleeping
      if (!remote.powerSaveBlocker.isStarted(this.powerSaveBlockerId)) {
        this.powerSaveBlockerId = remote.powerSaveBlocker.start('prevent-display-sleep');
      }
    });

    vlc.events.on('Buffering', percent => {
      console.log('buffering...', percent);
      if (percent === 100) {
        player.play();
      } else {
        player.pause();
        console.log('pausing...');
      }

      // Allow the display to sleep
      remote.powerSaveBlocker.stop(this.powerSaveBlockerId);
    });

    vlc.events.on('Paused', () => {
      console.log('paused...');

      // Allow the display to sleep
      remote.powerSaveBlocker.stop(this.powerSaveBlockerId);
    });

    $(window).resize(() => {
      console.log('resizing...');
      $('canvas').width($('.container').width());
    });

    this.player = vlc;

    return player;
  }

  initVLC(servingUrl) {
    vlcCommand((error, cmd) => {
      if (error) return console.error('Could not find vlc command path');

      if (process.platform === 'win32') {
        childProcess.execFile(cmd, [servingUrl], (_error, stdout) => {
        // childProcess.execFile(cmd, ['--version'], (_error, stdout) => {
          if (_error) return console.error(_error);
          console.log(stdout);
        });
      } else {
        childProcess.exec(`${cmd} ${servingUrl}`, (_error, stdout) => {
        // childProcess.exec(`${cmd} --version`, (_error, stdout) => {
          if (_error) return console.error(_error);
          console.log(stdout);
        });
      }
    });
  }
}
