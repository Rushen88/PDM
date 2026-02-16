import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Form, Input, Modal, Select, Switch, message } from 'antd';
import React from 'react';
import { catalogApi, type BankDetails, type Currency } from '../api';

interface BankDetailsModalProps {
  open: boolean;
  onClose: () => void;
  bankDetail?: BankDetails | null;
  supplierId?: string;
  contractorId?: string;
}

const CURRENCY_OPTIONS: { value: Currency; label: string }[] = [
  { value: 'RUB', label: '₽ Рубль' },
  { value: 'USD', label: '$ Доллар США' },
  { value: 'EUR', label: '€ Евро' },
  { value: 'CNY', label: '¥ Юань' },
];

export const BankDetailsModal: React.FC<BankDetailsModalProps> = ({
  open,
  onClose,
  bankDetail,
  supplierId,
  contractorId,
}) => {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const isEdit = !!bankDetail;

  const createMutation = useMutation({
    mutationFn: (data: Partial<BankDetails>) => catalogApi.bankDetails.create(data),
    onSuccess: () => {
      message.success('Банковские реквизиты добавлены');
      queryClient.invalidateQueries({ queryKey: ['bank-details'] });
      if (supplierId) {
        queryClient.invalidateQueries({ queryKey: ['suppliers', supplierId] });
      }
      if (contractorId) {
        queryClient.invalidateQueries({ queryKey: ['contractors', contractorId] });
      }
      onClose();
      form.resetFields();
    },
    onError: () => {
      message.error('Ошибка при добавлении реквизитов');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<BankDetails>) =>
      catalogApi.bankDetails.update(bankDetail!.id, data),
    onSuccess: () => {
      message.success('Банковские реквизиты обновлены');
      queryClient.invalidateQueries({ queryKey: ['bank-details'] });
      if (supplierId) {
        queryClient.invalidateQueries({ queryKey: ['suppliers', supplierId] });
      }
      if (contractorId) {
        queryClient.invalidateQueries({ queryKey: ['contractors', contractorId] });
      }
      onClose();
      form.resetFields();
    },
    onError: () => {
      message.error('Ошибка при обновлении реквизитов');
    },
  });

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      const data: Partial<BankDetails> = {
        ...values,
        supplier: supplierId,
        contractor: contractorId,
      };

      if (isEdit) {
        updateMutation.mutate(data);
      } else {
        createMutation.mutate(data);
      }
    } catch (error) {
      console.error('Validation failed:', error);
    }
  };

  React.useEffect(() => {
    if (open && bankDetail) {
      form.setFieldsValue({
        bank_name: bankDetail.bank_name,
        bik: bankDetail.bik,
        correspondent_account: bankDetail.correspondent_account,
        settlement_account: bankDetail.settlement_account,
        currency: bankDetail.currency,
        is_primary: bankDetail.is_primary,
        notes: bankDetail.notes,
      });
    } else if (open) {
      form.resetFields();
      form.setFieldsValue({
        currency: 'RUB',
        is_primary: false,
      });
    }
  }, [open, bankDetail, form]);

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Modal
      title={isEdit ? 'Редактирование реквизитов' : 'Новые банковские реквизиты'}
      open={open}
      onOk={handleSubmit}
      onCancel={onClose}
      okText={isEdit ? 'Сохранить' : 'Добавить'}
      cancelText="Отмена"
      confirmLoading={isLoading}
      width={600}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          currency: 'RUB',
          is_primary: false,
        }}
      >
        <Form.Item
          name="bank_name"
          label="Наименование банка"
          rules={[{ required: true, message: 'Введите наименование банка' }]}
        >
          <Input placeholder="ПАО Сбербанк" />
        </Form.Item>

        <Form.Item
          name="bik"
          label="БИК"
          rules={[
            { required: true, message: 'Введите БИК' },
            { len: 9, message: 'БИК должен содержать 9 цифр' },
            { pattern: /^\d+$/, message: 'БИК должен содержать только цифры' },
          ]}
        >
          <Input placeholder="044525225" maxLength={9} />
        </Form.Item>

        <Form.Item
          name="correspondent_account"
          label="Корреспондентский счёт"
          rules={[
            { required: true, message: 'Введите корр. счёт' },
            { len: 20, message: 'Корр. счёт должен содержать 20 цифр' },
            { pattern: /^\d+$/, message: 'Корр. счёт должен содержать только цифры' },
          ]}
        >
          <Input placeholder="30101810400000000225" maxLength={20} />
        </Form.Item>

        <Form.Item
          name="settlement_account"
          label="Расчётный счёт"
          rules={[
            { required: true, message: 'Введите расчётный счёт' },
            { len: 20, message: 'Расчётный счёт должен содержать 20 цифр' },
            { pattern: /^\d+$/, message: 'Расчётный счёт должен содержать только цифры' },
          ]}
        >
          <Input placeholder="40702810438000000001" maxLength={20} />
        </Form.Item>

        <Form.Item
          name="currency"
          label="Валюта"
          rules={[{ required: true, message: 'Выберите валюту' }]}
        >
          <Select options={CURRENCY_OPTIONS} />
        </Form.Item>

        <Form.Item
          name="is_primary"
          label="Основной счёт"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>

        <Form.Item
          name="notes"
          label="Примечания"
        >
          <Input.TextArea rows={3} placeholder="Дополнительная информация" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default BankDetailsModal;
