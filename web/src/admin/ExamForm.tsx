import { useEffect, useState } from 'react';
import { App, Form, Input, Modal, Switch } from 'antd';
import { api } from '../lib/api';
import type { Exam } from '../lib/types';

export function ExamFormModal({ open, exam, onClose, onSaved }: { open: boolean; exam?: Exam | null; onClose: () => void; onSaved: (e: Exam) => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) form.setFieldsValue(exam ? { name: exam.name, date: exam.date, location: exam.location, active: exam.active } : { name: '', date: '', location: '', active: true });
  }, [open, exam, form]);

  const submit = async () => {
    const v = await form.validateFields();
    setLoading(true);
    try {
      const saved = await api<Exam>(exam ? `/exams/${exam.id}` : '/exams', { method: exam ? 'PATCH' : 'POST', json: v });
      message.success(exam ? '已保存' : '考试已创建');
      onSaved(saved);
      onClose();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} title={exam ? '编辑考试' : '新建考试'} onCancel={onClose} onOk={submit} confirmLoading={loading} forceRender>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="考试名称" rules={[{ required: true, message: '请输入考试名称' }]}>
          <Input placeholder="例如：2026 选拔考试" maxLength={100} />
        </Form.Item>
        <Form.Item name="date" label="考试时间">
          <Input placeholder="例如：2026-10-10 09:00-11:00" maxLength={50} />
        </Form.Item>
        <Form.Item name="location" label="考场 / 地点">
          <Input placeholder="例如：综合楼 A101" maxLength={100} />
        </Form.Item>
        <Form.Item name="active" label="启用（停用后员工端不可见）" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
