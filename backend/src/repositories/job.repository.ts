import type { IJob, IJobApplication } from '../models/marketplace/Job.js';
import { Application, Job } from '../models/index.js';
import { BaseRepository } from './BaseRepository.js';

export class JobRepository extends BaseRepository<IJob> {
  constructor() {
    super(Job);
  }
}

export class ApplicationRepository extends BaseRepository<IJobApplication> {
  constructor() {
    super(Application);
  }
}

export const jobRepository = new JobRepository();
export const applicationRepository = new ApplicationRepository();
