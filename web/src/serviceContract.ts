/** Proposed service boundary for the teammate implementation. No network calls are made here. */
import type { Artifact, Asset, Creation, CreationSpec, InputSlot, Plan, Revision, Run, RunEvent } from './domain';
import type { ParameterSlot } from './catalog';

export interface ServiceTask { task: Creation; version: number }
export interface TurnRequest {
  taskId: string; turnId: string; idempotencyKey: string; expectedTaskVersion: number;
  text: string; selectedResultId?: string; policy: 'auto' | 'review';
}
export type TurnResponse =
  | { kind:'answer'; turnId:string; text:string; task:ServiceTask }
  | { kind:'clarification'; turnId:string; question:string; options?:{id:string;label:string}[]; task:ServiceTask }
  | { kind:'change'; turnId:string; spec:CreationSpec; changes:string[]; task:ServiceTask };
export interface WorkflowSchema {
  workflowId:string; sha256:string; catalogVersion:string; operation:string;
  availability:'available'|'missing_dependencies'|'unverified'|'unavailable';
  inputSlots:InputSlot[]; parameters:ParameterSlot[]; contractVersion:string;
  dependencyEvidenceRef?:string;
}
export interface PlanRequest {
  taskId:string; requestId:string; revision:Revision; expectedTaskVersion:number; catalogVersion:string;
}
export interface ValidatedPlan extends Plan {
  source:'live'; catalogVersion:string; inputContractVersion:string; environmentSnapshotId:string;
  runtimeValidation:'pending'|'passed'|'failed';
}
export interface SubmitRunRequest {
  taskId:string; planId:string; revisionId:string; inputFingerprint:string;
  catalogVersion:string; environmentSnapshotId:string; idempotencyKey:string; expectedTaskVersion:number;
}
export interface ServiceRun {
  run:Run; serverRunId:string; version:number; cursor:string;
  authority:'server'; artifactHashes?:Record<string,string>;
}
export interface RunEnvelope {
  eventId:string; serverRunId:string; sequence:number; cursor:string; serverTime:string;
  type:'accepted'|'status'|'step'|'repair'|'cancel_requested'|'cancelled'|'artifact'|'completed'|'failed';
  event:RunEvent; state:ServiceRun;
}
export interface UploadReceipt { uploadId:string; assetId:string; state:'uploading'|'ready'|'failed'; asset?:Asset; contentSha256?:string; error?:string }
export interface CancelReceipt { serverRunId:string; requestId:string; state:'requested'|'already_terminal'; snapshot?:ServiceRun }
export interface ServiceCapabilities {
  source:'live'; catalogVersion:string; uploads:{maxAssets:number;imageBytes:number;videoBytes:number;acceptedMime:string[]};
  cancellation:boolean; events:'sse'|'websocket'|'polling';
}
export interface CreationService {
  capabilities(signal?:AbortSignal):Promise<ServiceCapabilities>;
  getTask(taskId:string,signal?:AbortSignal):Promise<ServiceTask>;
  resolveTurn(input:TurnRequest,signal?:AbortSignal):Promise<TurnResponse>;
  selectInput(input:{taskId:string;artifactId:string;expectedTaskVersion:number;idempotencyKey:string},signal?:AbortSignal):Promise<ServiceTask>;
  plan(input:PlanRequest,signal?:AbortSignal):Promise<ValidatedPlan>;
  submitRun(input:SubmitRunRequest,signal?:AbortSignal):Promise<ServiceRun>;
  getRun(serverRunId:string,signal?:AbortSignal):Promise<ServiceRun>;
  cancelRun(input:{serverRunId:string;requestId:string;idempotencyKey:string},signal?:AbortSignal):Promise<CancelReceipt>;
  events(input:{serverRunId:string;afterCursor?:string},onEvent:(event:RunEnvelope)=>void,signal:AbortSignal):Promise<void>;
  workflowSchema(workflowId:string,catalogVersion:string,signal?:AbortSignal):Promise<WorkflowSchema>;
  upload(file:File,input:{taskId?:string;role:Asset['role'];idempotencyKey:string},signal?:AbortSignal):Promise<UploadReceipt>;
  artifact(artifactId:string,signal?:AbortSignal):Promise<Artifact & {contentSha256:string}>;
}
