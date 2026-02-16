import { DeleteOutlined, EditOutlined, PlusOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, message, Popconfirm, Space, Table, Tag, Tooltip } from 'antd';
import React from 'react';
import { catalogApi, type BankDetails } from '../api';
import { BankDetailsModal } from './BankDetailsModal';

interface BankDetailsListProps {
  bankDetails: BankDetails[];
  supplierId?: string;
  contractorId?: string;
  loading?: boolean;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  RUB: '₽',
  USD: '$',
  EUR: '€',
  CNY: '¥',
};

export const BankDetailsList: React.FC<BankDetailsListProps> = ({
  bankDetails,
  supplierId,
  contractorId,
  loading = false,
}) => {
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingItem, setEditingItem] = React.useState<BankDetails | null>(null);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (id: string) => catalogApi.bankDetails.delete(id),
    onSuccess: () => {
      message.success('Реквизиты удалены');
      queryClient.invalidateQueries({ queryKey: ['bank-details'] });
      if (supplierId) {
        queryClient.invalidateQueries({ queryKey: ['suppliers', supplierId] });
      }
      if (contractorId) {
        queryClient.invalidateQueries({ queryKey: ['contractors', contractorId] });
      }
    },
    onError: () => {
      message.error('Ошибка при удалении');
    },
  });

  const setPrimaryMutation = useMutation({
    mutationFn: (id: string) => catalogApi.bankDetails.setPrimary(id),
    onSuccess: () => {
      message.success('Основной счёт установлен');
      queryClient.invalidateQueries({ queryKey: ['bank-details'] });
      if (supplierId) {
        queryClient.invalidateQueries({ queryKey: ['suppliers', supplierId] });
      }
      if (contractorId) {
        queryClient.invalidateQueries({ queryKey: ['contractors', contractorId] });
      }
    },
    onError: () => {
      message.error('Ошибка при установке основного счёта');
    },
  });

  const handleAdd = () => {
    setEditingItem(null);
    setModalOpen(true);
  };

  const handleEdit = (item: BankDetails) => {
    setEditingItem(item);
    setModalOpen(true);
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const handleSetPrimary = (id: string) => {
    setPrimaryMutation.mutate(id);
  };

  const columns = [
    {
      title: 'Банк',
      dataIndex: 'bank_name',
      key: 'bank_name',
      render: (text: string, record: BankDetails) => (
        <Space>
          {text}
          {record.is_primary && (
            <Tag color="gold" icon={<StarFilled />}>
              Основной
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'БИК',
      dataIndex: 'bik',
      key: 'bik',
      width: 120,
    },
    {
      title: 'Расчётный счёт',
      dataIndex: 'settlement_account',
      key: 'settlement_account',
      width: 220,
    },
    {
      title: 'Валюта',
      dataIndex: 'currency',
      key: 'currency',
      width: 80,
      render: (currency: string) => (
        <Tag>{CURRENCY_SYMBOLS[currency] || currency}</Tag>
      ),
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 150,
      render: (_: unknown, record: BankDetails) => (
        <Space size="small">
          {!record.is_primary && (
            <Tooltip title="Сделать основным">
              <Button
                type="text"
                size="small"
                icon={<StarOutlined />}
                onClick={() => handleSetPrimary(record.id)}
                loading={setPrimaryMutation.isPending}
              />
            </Tooltip>
          )}
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          />
          <Popconfirm
            title="Удалить реквизиты?"
            description="Это действие нельзя отменить"
            onConfirm={() => handleDelete(record.id)}
            okText="Удалить"
            cancelText="Отмена"
          >
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 500, fontSize: 16 }}>Банковские реквизиты</span>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="small"
          onClick={handleAdd}
        >
          Добавить
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={bankDetails}
        rowKey="id"
        size="small"
        loading={loading || deleteMutation.isPending}
        pagination={false}
        locale={{ emptyText: 'Нет банковских реквизитов' }}
      />

      <BankDetailsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        bankDetail={editingItem}
        supplierId={supplierId}
        contractorId={contractorId}
      />
    </div>
  );
};

export default BankDetailsList;
