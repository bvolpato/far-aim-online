import sourceStatusData from '../../../data/source-status.json';
import type { SourceStatus } from './types';

export function getSourceStatus(): SourceStatus {
  return sourceStatusData as SourceStatus;
}
