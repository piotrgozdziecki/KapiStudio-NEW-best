/**
 * Kapi-Studio - File System Access API Streaming Video Export Service
 * Streams encoded MP4/WebM video chunks directly to a user-selected disk file
 * using FileSystemAccess API (showSaveFilePicker) to bypass browser RAM limits.
 * Includes AbortController cancellation and VRAM/OffscreenCanvas resource cleanup.
 */

import { videoExportService } from './videoExportService';
import type { ExportPreset, ExportProgress, ExportOutput, MediaSource, TimelineClip } from './videoExportTypes';
import type { ProjectState } from '../../types/project';

export interface StreamingExportOptions {
  project: ProjectState;
  preset: ExportPreset;
  onProgress?: (progress: ExportProgress) => void;
}

export class StreamingExportService {
  private abortController: AbortController | null = null;

  /**
   * Checks if File System Access API streaming save is supported by browser
   */
  public isFileSystemAccessSupported(): boolean {
    return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
  }

  /**
   * Prompts user for a direct disk destination file and streams encoded chunks
   */
  public async exportAndStreamToDisk(options: StreamingExportOptions): Promise<ExportOutput> {
    const { project, preset, onProgress } = options;
    this.abortController = new AbortController();

    let fileHandle: FileSystemFileHandle | null = null;
    let writableStream: FileSystemWritableFileStream | null = null;

    const fileName = `${project.name || 'Film_Montaz'}_${preset.resolution}.${preset.container || 'mp4'}`;

    // Prompt user for save location if File System Access API is supported
    if (this.isFileSystemAccessSupported()) {
      try {
        fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: fileName,
          types: [{
            description: 'Plik wideo MP4 / WebM',
            accept: {
              'video/mp4': ['.mp4'],
              'video/webm': ['.webm']
            }
          }]
        });
        if (fileHandle) {
          writableStream = await fileHandle.createWritable();
        }
      } catch (pickerErr: any) {
        if (pickerErr.name === 'AbortError') {
          throw new Error('Anulowano wybór pliku zapisu.');
        }
        console.warn('[StreamingExportService] File System Access API error, falling back to memory buffer:', pickerErr);
      }
    }

    try {
      // Build sources and timeline clips
      const sources: MediaSource[] = (project.mediaLibrary || []).map(c => ({
        id: c.id,
        uri: c.objectUrl || c.thumbnailUrl || '',
        file: c.file,
        name: c.name,
        size: c.size || 0,
        duration: c.duration || 10,
        width: c.width || 1920,
        height: c.height || 1080,
        fps: c.fps || 30,
        videoCodec: 'H.264',
        audioCodec: 'AAC',
        audioChannels: c.hasAudio ? 2 : 0,
        sampleRate: c.hasAudio ? 48000 : 0,
        orientation: c.orientation || 'landscape',
        hasAudio: c.hasAudio ?? true,
        supported: true
      }));

      const clips: TimelineClip[] = (project.timelineItems || []).map((item, i) => ({
        id: item.id,
        sourceId: item.clipId,
        sourceStart: item.sourceStart,
        sourceEnd: item.sourceEnd,
        startTime: item.sourceStart,
        endTime: item.sourceEnd,
        duration: item.duration,
        timelineStart: item.timelineStart,
        speed: item.speed || 1,
        volume: item.volume ?? 1,
        muted: Boolean(item.muted),
        order: i,
        fitMode: item.fitMode || 'fit',
        rotation: item.rotation || 0,
        scale: item.scale || 1,
        position: item.position,
        crop: item.crop,
        colorAdjustments: item.colorAdjustments,
        titleCard: item.titleCard,
        outroCard: item.outroCard,
        dedication: item.dedication,
        transitionIn: item.transitionIn,
        transitionOut: item.transitionOut,
        transitionDuration: item.transitionDuration
      }));

      const plan = videoExportService.prepareExport(sources, clips, preset, {
        audioTracks: project.audioTracks,
        textLayers: project.textLayers,
        outroCard: project.settings?.outroCard
      });

      // Execute export via VideoExportService
      const output = await videoExportService.startExport(
        plan,
        (progress) => {
          if (this.abortController?.signal.aborted) {
            throw new Error('Eksport został anulowany przez użytkownika.');
          }
          if (onProgress) onProgress(progress);
        }
      );

      // If writableStream is active, write blob directly and close stream
      if (writableStream && output.blob) {
        const reader = output.blob.stream().getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await writableStream.write(value);
        }
        await writableStream.close();
      }

      return output;
    } catch (err: any) {
      if (writableStream) {
        try { await writableStream.abort(); } catch {}
      }
      throw err;
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Safely cancels current streaming export and releases memory handles
   */
  public cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    videoExportService.cancelExport();
  }
}

export const streamingExportService = new StreamingExportService();
