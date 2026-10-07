/**
 * Multiple Exports & Export Queue Manager (ETAP 2)
 * 
 * Allows users to enqueue multiple export jobs (e.g. Master 4K, YouTube 1080p, TikTok 9:16)
 * without blocking UI navigation or editing operations:
 * - Runs tasks serially in background with regulated priority
 * - Tracks state: QUEUED, PREPARING, RENDERING, ENCODING, FINALIZING, DONE, FAILED, CANCELLED
 * - Notifies subscribers reactively
 */

import { ExportPlan, ExportProgress, ExportOutput } from './videoExportTypes';
import { videoExportService } from './videoExportService';

export type QueueJobStatus = 
  | 'QUEUED' 
  | 'PREPARING' 
  | 'RENDERING' 
  | 'ENCODING' 
  | 'FINALIZING' 
  | 'DONE' 
  | 'FAILED' 
  | 'CANCELLED';

export interface ExportQueueJob {
  id: string;
  name: string;
  plan: ExportPlan;
  status: QueueJobStatus;
  progressPercent: number;
  stageMessage: string;
  enqueuedAt: number;
  startedAt?: number;
  completedAt?: number;
  output?: ExportOutput;
  error?: string;
}

export type QueueListener = (jobs: ExportQueueJob[]) => void;

class ExportQueueManager {
  private jobs: ExportQueueJob[] = [];
  private isProcessing = false;
  private currentJobId: string | null = null;
  private listeners = new Set<QueueListener>();

  enqueue(name: string, plan: ExportPlan): string {
    const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const job: ExportQueueJob = {
      id,
      name,
      plan,
      status: 'QUEUED',
      progressPercent: 0,
      stageMessage: 'W kolejce do eksportu...',
      enqueuedAt: Date.now()
    };

    this.jobs.push(job);
    this.notify();
    this.processNext();
    return id;
  }

  cancelJob(jobId: string): void {
    const job = this.jobs.find(j => j.id === jobId);
    if (!job) return;

    if (this.currentJobId === jobId) {
      videoExportService.cancelExport();
      job.status = 'CANCELLED';
      job.stageMessage = 'Eksport anulowany przez użytkownika';
    } else if (job.status === 'QUEUED') {
      job.status = 'CANCELLED';
      job.stageMessage = 'Anulowano przed rozpoczęciem';
    }

    this.notify();
  }

  removeJob(jobId: string): void {
    if (this.currentJobId === jobId) {
      this.cancelJob(jobId);
    }
    this.jobs = this.jobs.filter(j => j.id !== jobId);
    this.notify();
  }

  getJobs(): ExportQueueJob[] {
    return [...this.jobs];
  }

  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    listener(this.getJobs());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const jobs = this.getJobs();
    this.listeners.forEach(fn => {
      try { fn(jobs); } catch {}
    });
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing) return;

    const nextJob = this.jobs.find(j => j.status === 'QUEUED');
    if (!nextJob) return;

    this.isProcessing = true;
    this.currentJobId = nextJob.id;
    nextJob.status = 'PREPARING';
    nextJob.startedAt = Date.now();
    nextJob.stageMessage = 'Inicjalizacja kodera i sprawdzanie źródeł...';
    this.notify();

    try {
      const output = await videoExportService.startExport(nextJob.plan, (progress: ExportProgress) => {
        let status: QueueJobStatus = 'RENDERING';
        if (progress.stage === 'VIDEO_ENCODING') status = 'ENCODING';
        if (progress.stage === 'MUXING' || progress.stage === 'FINAL_FLUSH') status = 'FINALIZING';
        if (progress.stage === 'COMPLETED') status = 'DONE';

        nextJob.status = status;
        nextJob.progressPercent = Math.min(100, Math.round(progress.percent));
        nextJob.stageMessage = progress.statusMessage || `Przetwarzanie (${nextJob.progressPercent}%)...`;
        this.notify();
      });

      nextJob.status = 'DONE';
      nextJob.progressPercent = 100;
      nextJob.stageMessage = `Eksport zakończony sukcesem (${(output.sizeBytes / 1024 / 1024).toFixed(1)} MB)`;
      nextJob.completedAt = Date.now();
      nextJob.output = output;
    } catch (err: any) {
      if ((nextJob.status as QueueJobStatus) !== 'CANCELLED') {
        nextJob.status = 'FAILED';
        nextJob.error = err?.message || String(err);
        nextJob.stageMessage = `Błąd eksportu: ${nextJob.error}`;
      }
    } finally {
      this.isProcessing = false;
      this.currentJobId = null;
      this.notify();
      // Process next queued task
      this.processNext();
    }
  }
}

export const exportQueueManager = new ExportQueueManager();
