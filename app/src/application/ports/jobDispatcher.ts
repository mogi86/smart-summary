/** 登録済みジョブの実行を依頼する */
export interface JobDispatcher {
  dispatch(jobId: string): Promise<void>;
}
