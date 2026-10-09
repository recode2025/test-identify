import { useState } from 'react';
import { Alert, App, Button, Modal, Radio, Result, Space, Steps, Table, Tag, Typography, Upload } from 'antd';
import { DownloadOutlined, FileExcelOutlined, InboxOutlined } from '@ant-design/icons';
import { api, download } from '../lib/api';

interface SheetInfo {
  name: string;
  ok: boolean;
  reason?: string;
  rowCount: number;
  columns?: Record<string, string>;
  preview: { seq: number | null; studentNo: string; name: string; seatNo: string | null }[];
}
interface ImportResult {
  sheet: string;
  inserted: number;
  updated: number;
  removed: number;
  total: number;
  missingPhotos: string[];
  errors: { row: number; reason: string }[];
}

const COLUMN_LABEL: Record<string, string> = { seq: '序号', studentNo: '学号', name: '姓名', seatNo: '座位号' };

export function ImportModal({ examId, open, onClose, onDone }: { examId: number; open: boolean; onClose: () => void; onDone: () => void }) {
  const { message } = App.useApp();
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [sheet, setSheet] = useState<string | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => {
    setFile(null);
    setSheets([]);
    setSheet(null);
    setResult(null);
    setMode('merge');
  };
  const close = () => {
    reset();
    onClose();
  };

  const inspect = async (f: File) => {
    setLoading(true);
    try {
      const form = new FormData();
      form.append('file', f);
      const res = await api<{ sheets: SheetInfo[]; recommended: string | null }>('/import/inspect', { method: 'POST', body: form });
      setFile(f);
      setSheets(res.sheets);
      setSheet(res.recommended);
      if (!res.recommended) message.warning('没有找到包含「学号」「姓名/名称」表头的工作表');
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    if (!file || !sheet) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('sheet', sheet);
      form.append('mode', mode);
      const res = await api<ImportResult>(`/exams/${examId}/import`, { method: 'POST', body: form });
      setResult(res);
      onDone();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const current = sheets.find((s) => s.name === sheet);
  const step = result ? 2 : file ? 1 : 0;

  return (
    <Modal
      open={open}
      title="导入考生名单"
      width={760}
      onCancel={close}
      destroyOnClose
      footer={
        result ? (
          <Button type="primary" onClick={close}>
            完成
          </Button>
        ) : file ? (
          <Space>
            <Button onClick={reset}>重新选择文件</Button>
            <Button type="primary" loading={loading} disabled={!current?.ok} onClick={submit}>
              导入 {current?.rowCount ?? 0} 名考生
            </Button>
          </Space>
        ) : null
      }
    >
      <Steps size="small" current={step} style={{ marginBottom: 20 }} items={[{ title: '选择文件' }, { title: '确认工作表' }, { title: '完成' }]} />

      {step === 0 && (
        <>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="表格格式说明"
            description={
              <div>
                参照「选拔作业」的<b>最终</b>表：第一行为表头，需包含 <Tag>学号</Tag>
                <Tag>名称/姓名</Tag>，可选 <Tag>座位号</Tag>
                <Tag>序号</Tag>；座位号可以为空，其余列（如分数）自动忽略。多个工作表时默认使用名为「最终」的表。
                <div style={{ marginTop: 8 }}>
                  <Button size="small" icon={<DownloadOutlined />} onClick={() => download('/import/template.xlsx', '考生名单模板.xlsx').catch((e) => message.error(e.message))}>
                    下载 Excel 模板
                  </Button>
                </div>
              </div>
            }
          />
          <Upload.Dragger
            accept=".xlsx"
            showUploadList={false}
            disabled={loading}
            beforeUpload={(f) => {
              inspect(f);
              return false;
            }}
          >
            <p className="ant-upload-drag-icon">{loading ? <FileExcelOutlined spin /> : <InboxOutlined />}</p>
            <p className="ant-upload-text">点击或拖拽 Excel 文件（.xlsx）到此处</p>
            <p className="ant-upload-hint">后续可重复上传同格式表格，按学号自动更新</p>
          </Upload.Dragger>
        </>
      )}

      {step === 1 && (
        <>
          <Typography.Text type="secondary">文件：{file?.name}</Typography.Text>
          <div style={{ margin: '12px 0' }}>
            <div style={{ marginBottom: 6, fontWeight: 600 }}>选择工作表</div>
            <Radio.Group value={sheet} onChange={(e) => setSheet(e.target.value)}>
              <Space direction="vertical">
                {sheets.map((s) => (
                  <Radio key={s.name} value={s.name} disabled={!s.ok}>
                    {s.name}{' '}
                    {s.ok ? (
                      <Typography.Text type="secondary">
                        （{s.rowCount} 行，识别列：{Object.entries(s.columns ?? {}).map(([k, v]) => `${COLUMN_LABEL[k]}←${v}`).join('、')}）
                      </Typography.Text>
                    ) : (
                      <Typography.Text type="danger">（{s.reason}）</Typography.Text>
                    )}
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
          </div>
          {current?.ok && (
            <>
              <div style={{ marginBottom: 6, fontWeight: 600 }}>前 5 行预览</div>
              <Table
                size="small"
                pagination={false}
                rowKey="studentNo"
                dataSource={current.preview}
                columns={[
                  { title: '序号', dataIndex: 'seq', width: 70 },
                  { title: '姓名', dataIndex: 'name' },
                  { title: '学号', dataIndex: 'studentNo' },
                  { title: '座位号', dataIndex: 'seatNo', render: (v) => v || <Typography.Text type="secondary">空</Typography.Text> },
                ]}
              />
            </>
          )}
          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 6, fontWeight: 600 }}>导入方式</div>
            <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
              <Space direction="vertical">
                <Radio value="merge">合并更新：按学号新增或更新姓名/座位号，保留已有核查结果</Radio>
                <Radio value="replace">
                  覆盖：同上，并<Typography.Text type="danger">删除表中不存在的考生</Typography.Text>
                </Radio>
              </Space>
            </Radio.Group>
          </div>
        </>
      )}

      {step === 2 && result && (
        <Result
          status={result.errors.length ? 'warning' : 'success'}
          title={`已从「${result.sheet}」导入，本场共 ${result.total} 名考生`}
          subTitle={`新增 ${result.inserted}，更新 ${result.updated}${result.removed ? `，删除 ${result.removed}` : ''}`}
          extra={
            <div style={{ textAlign: 'left' }}>
              {result.missingPhotos.length > 0 && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 8 }}
                  message={`${result.missingPhotos.length} 名考生还没有照片，请上传照片压缩包`}
                  description={<div style={{ maxHeight: 80, overflow: 'auto', fontSize: 12 }}>{result.missingPhotos.join('、')}</div>}
                />
              )}
              {result.errors.length > 0 && (
                <Alert
                  type="error"
                  showIcon
                  message={`${result.errors.length} 行有问题`}
                  description={
                    <div style={{ maxHeight: 120, overflow: 'auto', fontSize: 12 }}>
                      {result.errors.map((e, i) => (
                        <div key={i}>
                          第 {e.row} 行：{e.reason}
                        </div>
                      ))}
                    </div>
                  }
                />
              )}
            </div>
          }
        />
      )}
    </Modal>
  );
}
