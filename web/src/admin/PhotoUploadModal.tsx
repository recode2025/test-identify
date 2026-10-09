import { useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Modal, Progress, Result, Tabs, Tag, Typography, Upload } from 'antd';
import { DownloadOutlined, FileZipOutlined, PictureOutlined } from '@ant-design/icons';
import { api, download, uploadWithProgress } from '../lib/api';
import { useSocketEvent } from '../lib/socket';
import type { PhotoJob } from '../lib/types';

const BATCH = 40;

export function PhotoUploadModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { message } = App.useApp();
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [job, setJob] = useState<PhotoJob | null>(null);
  const [batch, setBatch] = useState<{ total: number; done: number; succeeded: number; failed: { name: string; reason: string }[] } | null>(null);
  const jobId = useRef<string | null>(null);

  useSocketEvent<PhotoJob>('photos:job', (j) => j.id === jobId.current && setJob(j));

  // Poll as well, in case socket events are missed (e.g. long-polling hiccups).
  useEffect(() => {
    if (!job || job.status !== 'running') return;
    const t = setInterval(() => api<PhotoJob>(`/photos/jobs/${job.id}`).then(setJob).catch(() => undefined), 2000);
    return () => clearInterval(t);
  }, [job?.id, job?.status]);

  useEffect(() => {
    if (job && job.status !== 'running') onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);

  const reset = () => {
    setUploadPct(null);
    setJob(null);
    setBatch(null);
    jobId.current = null;
  };
  const busy = (uploadPct !== null && !job) || job?.status === 'running' || (batch !== null && batch.done < batch.total);

  const uploadZip = async (file: File) => {
    reset();
    setUploadPct(0);
    try {
      const form = new FormData();
      form.append('file', file);
      const j = await uploadWithProgress<PhotoJob>('/photos/zip', form, setUploadPct);
      jobId.current = j.id;
      setJob(j);
    } catch (e: any) {
      message.error(e.message);
      setUploadPct(null);
    }
  };

  const uploadImages = async (files: File[]) => {
    reset();
    const state = { total: files.length, done: 0, succeeded: 0, failed: [] as { name: string; reason: string }[] };
    setBatch({ ...state });
    for (let i = 0; i < files.length; i += BATCH) {
      const form = new FormData();
      files.slice(i, i + BATCH).forEach((f) => form.append('files', f));
      try {
        const r = await api<{ succeeded: number; failed: { name: string; reason: string }[] }>('/photos/batch', { method: 'POST', body: form });
        state.succeeded += r.succeeded;
        state.failed.push(...r.failed);
      } catch (e: any) {
        files.slice(i, i + BATCH).forEach((f) => state.failed.push({ name: f.name, reason: e.message }));
      }
      state.done = Math.min(files.length, i + BATCH);
      setBatch({ ...state });
    }
    onDone();
  };

  const failedList = (failed: { name: string; reason: string }[]) =>
    failed.length > 0 && (
      <Alert
        type="warning"
        showIcon
        style={{ textAlign: 'left', marginTop: 12 }}
        message={`${failed.length} 个文件未成功`}
        description={
          <div style={{ maxHeight: 140, overflow: 'auto', fontSize: 12 }}>
            {failed.map((f, i) => (
              <div key={i}>
                {f.name}：{f.reason}
              </div>
            ))}
          </div>
        }
      />
    );

  const progressView = () => {
    if (batch) {
      const done = batch.done >= batch.total;
      return (
        <Result
          status={done ? (batch.failed.length ? 'warning' : 'success') : 'info'}
          icon={done ? undefined : <PictureOutlined />}
          title={done ? `完成：成功 ${batch.succeeded} 张` : `正在上传并压缩 ${batch.done}/${batch.total}`}
          extra={
            <>
              <Progress percent={Math.round((batch.done / batch.total) * 100)} />
              {done && failedList(batch.failed)}
            </>
          }
        />
      );
    }
    if (uploadPct === null) return null;
    if (!job) {
      return <Result status="info" icon={<FileZipOutlined />} title="正在上传压缩包…" extra={<Progress percent={uploadPct} />} />;
    }
    const pct = job.total ? Math.round((job.processed / job.total) * 100) : 0;
    if (job.status === 'error') return <Result status="error" title="处理失败" subTitle={job.error} />;
    return (
      <Result
        status={job.status === 'done' ? (job.failed.length ? 'warning' : 'success') : 'info'}
        icon={job.status === 'running' ? <PictureOutlined /> : undefined}
        title={job.status === 'done' ? `处理完成：成功 ${job.succeeded} 张` : `正在压缩照片 ${job.processed}/${job.total || '…'}`}
        subTitle={job.status === 'running' ? '可以关闭窗口，后台会继续处理' : job.fileName}
        extra={
          <>
            <Progress percent={pct} status={job.status === 'running' ? 'active' : undefined} />
            {job.status === 'done' && failedList(job.failed)}
          </>
        }
      />
    );
  };

  const rules = (
    <Alert
      type="info"
      showIcon
      style={{ marginBottom: 16 }}
      message="照片命名规则"
      description={
        <div>
          每张照片以<b>学号</b>命名，如 <Tag>260450101.jpg</Tag>
          <Tag>260450102.png</Tag>；支持 jpg / png / bmp / webp / heic，zip 内可含子文件夹。同一学号重复上传会覆盖旧照片，所有考试共用。
          原图无需压缩，系统自动生成手机端用的小图（单张约 20-40KB）。
          <div style={{ marginTop: 8 }}>
            <Button size="small" icon={<DownloadOutlined />} onClick={() => download('/photos/template.zip', '照片上传模板.zip').catch((e) => message.error(e.message))}>
              下载照片压缩包模板
            </Button>
          </div>
        </div>
      }
    />
  );

  const showProgress = uploadPct !== null || batch !== null;

  return (
    <Modal
      open={open}
      title="上传考生照片"
      width={640}
      onCancel={onClose}
      footer={
        showProgress && !busy ? (
          <>
            <Button onClick={reset}>继续上传</Button>
            <Button type="primary" onClick={onClose}>
              完成
            </Button>
          </>
        ) : null
      }
    >
      {showProgress ? (
        progressView()
      ) : (
        <>
          {rules}
          <Tabs
            items={[
              {
                key: 'zip',
                label: 'ZIP 压缩包（推荐）',
                children: (
                  <Upload.Dragger accept=".zip" showUploadList={false} beforeUpload={(f) => (uploadZip(f), false)}>
                    <p className="ant-upload-drag-icon">
                      <FileZipOutlined />
                    </p>
                    <p className="ant-upload-text">点击或拖拽 zip 压缩包到此处</p>
                    <p className="ant-upload-hint">支持上千张、数百 MB 的压缩包</p>
                  </Upload.Dragger>
                ),
              },
              {
                key: 'images',
                label: '直接选择图片',
                children: (
                  <Upload.Dragger
                    accept="image/*,.bmp,.heic"
                    multiple
                    showUploadList={false}
                    beforeUpload={(f, list) => {
                      if (f === list[list.length - 1]) uploadImages(list as unknown as File[]);
                      return false;
                    }}
                  >
                    <p className="ant-upload-drag-icon">
                      <PictureOutlined />
                    </p>
                    <p className="ant-upload-text">点击多选或拖拽图片到此处</p>
                    <Typography.Text type="secondary">适合补传少量照片</Typography.Text>
                  </Upload.Dragger>
                ),
              },
            ]}
          />
        </>
      )}
    </Modal>
  );
}
