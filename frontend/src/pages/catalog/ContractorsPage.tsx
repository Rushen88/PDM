import {
    BankOutlined,
    DeleteOutlined,
    EditOutlined,
    MailOutlined,
    PhoneOutlined,
    PlusOutlined, SearchOutlined,
    StarFilled,
    UserOutlined
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Avatar,
    Button,
    Card,
    DatePicker,
    Divider,
    Empty,
    Form,
    Input,
    List,
    message,
    Modal,
    Popconfirm,
    Rate,
    Space,
    Spin,
    Table,
    Tabs,
    Tag,
    Typography
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useState } from 'react';

import { type BankDetails, BankDetailsList, catalogApi, type ContactPerson, type Contractor } from '../../features/catalog';
import { useModuleAccess } from '../../shared/hooks/useModuleAccess';

const { Title, Text } = Typography;

export default function ContractorsPage() {
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingContractor, setEditingContractor] = useState<Contractor | null>(null);
  const [form] = Form.useForm();
  const [contactForm] = Form.useForm();
  
  // Состояние для контактных лиц
  const [contacts, setContacts] = useState<Partial<ContactPerson>[]>([]);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Partial<ContactPerson> | null>(null);
  const [editingContactIndex, setEditingContactIndex] = useState<number | null>(null);
  const { canEdit, canDelete } = useModuleAccess('catalog.contractors');
  
  // Состояние для банковских реквизитов
  const [bankDetails, setBankDetails] = useState<BankDetails[]>([]);

  // Fetch contractors
  const { data: contractorsData, isLoading } = useQuery({
    queryKey: ['contractors', searchText],
    queryFn: () => catalogApi.contractors.list({ search: searchText || undefined }),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const contractors = contractorsData?.results || [];

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: Partial<Contractor>) => {
      let contractor: Contractor;
      if (editingContractor) {
        contractor = await catalogApi.contractors.update(editingContractor.id, data);
        
        // Определяем какие контакты удалить, обновить или создать
        const existingIds = new Set(editingContractor.contacts?.map(c => c.id) || []);
        const currentIds = new Set(contacts.filter(c => c.id).map(c => c.id!));
        
        // Удаляем контакты, которых нет в текущем списке
        for (const contact of editingContractor.contacts || []) {
          if (!currentIds.has(contact.id)) {
            await catalogApi.contactPersons.delete(contact.id);
          }
        }
        
        // Обновляем или создаём контакты
        for (const contact of contacts) {
          if (contact.id && existingIds.has(contact.id)) {
            // Обновляем существующий
            await catalogApi.contactPersons.update(contact.id, {
              ...contact,
              contractor: contractor.id,
            });
          } else {
            // Создаём новый
            await catalogApi.contactPersons.create({
              ...contact,
              contractor: contractor.id,
            });
          }
        }
      } else {
        contractor = await catalogApi.contractors.create(data);
        
        // Создаём новые контакты
        for (const contact of contacts) {
          await catalogApi.contactPersons.create({
            ...contact,
            contractor: contractor.id,
          });
        }
      }
      
      return contractor;
    },
    onSuccess: () => {
      message.success(editingContractor ? 'Подрядчик обновлён' : 'Подрядчик создан');
      queryClient.invalidateQueries({ queryKey: ['contractors'] });
      handleModalClose();
    },
    onError: () => {
      message.error('Ошибка при сохранении подрядчика');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => catalogApi.contractors.delete(id),
    onSuccess: () => {
      message.success('Подрядчик удалён');
      queryClient.invalidateQueries({ queryKey: ['contractors'] });
    },
    onError: () => {
      message.error('Ошибка при удалении подрядчика');
    },
  });

  const handleModalClose = () => {
    setModalOpen(false);
    setEditingContractor(null);
    form.resetFields();
    setContacts([]);
    setBankDetails([]);
  };

  const handleEdit = async (contractor: Contractor) => {
    // Загружаем детальные данные с контактами и банковскими реквизитами
    try {
      const fullData = await catalogApi.contractors.get(contractor.id);
      setEditingContractor(fullData);
      form.setFieldsValue({
        ...fullData,
        contract_date: fullData.contract_date ? dayjs(fullData.contract_date) : null,
        // Преобразуем rating в number для Rate компонента
        rating: fullData.rating != null ? parseFloat(String(fullData.rating)) : null,
      });
      setContacts(fullData.contacts || []);
      
      // Загружаем банковские реквизиты
      const bankDetailsData = await catalogApi.bankDetails.byContractor(contractor.id);
      setBankDetails(bankDetailsData);
      
      setModalOpen(true);
    } catch (error) {
      message.error('Ошибка загрузки данных подрядчика');
    }
  };

  const handleAdd = () => {
    setEditingContractor(null);
    form.resetFields();
    setContacts([]);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const data = {
      ...values,
      contract_date: values.contract_date ? values.contract_date.format('YYYY-MM-DD') : null,
    };
    saveMutation.mutate(data);
  };

  // Управление контактами
  const handleAddContact = () => {
    setEditingContact(null);
    setEditingContactIndex(null);
    contactForm.resetFields();
    setContactModalOpen(true);
  };

  const handleEditContact = (contact: Partial<ContactPerson>, index: number) => {
    setEditingContact(contact);
    setEditingContactIndex(index);
    contactForm.setFieldsValue(contact);
    setContactModalOpen(true);
  };

  const handleDeleteContact = (index: number) => {
    const newContacts = [...contacts];
    newContacts.splice(index, 1);
    if (newContacts.length > 0 && !newContacts.find(c => c.is_primary)) {
      newContacts[0].is_primary = true;
    }
    setContacts(newContacts);
  };

  const handleSetPrimaryContact = (index: number) => {
    setContacts(contacts.map((c, i) => ({ ...c, is_primary: i === index })));
  };

  const handleContactSubmit = async () => {
    const values = await contactForm.validateFields();
    if (editingContactIndex !== null) {
      const newContacts = [...contacts];
      newContacts[editingContactIndex] = { ...newContacts[editingContactIndex], ...values };
      setContacts(newContacts);
    } else {
      const newContact = { 
        ...values, 
        is_primary: contacts.length === 0 
      };
      setContacts([...contacts, newContact]);
    }
    setContactModalOpen(false);
    contactForm.resetFields();
  };

  // Получить полное имя контакта (для новых контактов без full_name с сервера)
  const getContactFullName = (contact: Partial<ContactPerson>) => {
    if (contact.full_name) return contact.full_name;
    const parts = [contact.last_name, contact.first_name, contact.middle_name].filter(Boolean);
    return parts.join(' ') || 'Без имени';
  };

  const columns: ColumnsType<Contractor> = [
    {
      title: 'Наименование',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Contractor) => (
        <div>
          <div style={{ fontWeight: 500 }}>{text}</div>
          {record.full_name && <Text type="secondary" style={{ fontSize: 12 }}>{record.full_name}</Text>}
        </div>
      ),
    },
    {
      title: 'ИНН',
      dataIndex: 'inn',
      key: 'inn',
      width: 130,
    },
    {
      title: 'Специализация',
      dataIndex: 'specialization',
      key: 'specialization',
      ellipsis: true,
    },
    {
      title: 'Основной контакт',
      dataIndex: 'primary_contact',
      key: 'primary_contact',
      width: 220,
      render: (contact: { full_name?: string; phone?: string } | null) => {
        if (!contact) return <Text type="secondary">—</Text>;
        return (
          <div>
            <div><UserOutlined /> {contact.full_name || 'Без имени'}</div>
            {contact.phone && <Text type="secondary" style={{ fontSize: 12 }}><PhoneOutlined /> {contact.phone}</Text>}
          </div>
        );
      },
    },
    {
      title: 'Контактов',
      dataIndex: 'contacts_count',
      key: 'contacts_count',
      width: 100,
      render: (count: number) => (
        <Tag>{count || 0}</Tag>
      ),
    },
    {
      title: 'Рейтинг',
      dataIndex: 'rating',
      key: 'rating',
      width: 160,
      render: (rating: number | string | null) => (
        <Rate 
          disabled 
          value={rating != null ? parseFloat(String(rating)) : 0} 
          allowHalf 
          style={{ fontSize: 14 }} 
        />
      ),
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 100,
      render: (_: unknown, record: Contractor) => (
        <Space>
          {canEdit && (
            <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          )}
          {canDelete && (
            <Popconfirm
              title="Удалить подрядчика?"
              description="Все связанные контакты также будут удалены"
              onConfirm={() => deleteMutation.mutate(record.id)}
            >
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="page-container">
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Подрядчики</Title>
          <Text type="secondary">Справочник подрядчиков для изготовления изделий</Text>
        </div>
        {canEdit && (
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>Добавить подрядчика</Button>
        )}
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="Поиск по наименованию, ИНН, специализации..."
            prefix={<SearchOutlined />}
            style={{ width: 340 }}
            allowClear
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </Space>
      </Card>

      <Card size="small">
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : contractors.length === 0 ? (
          <Empty description="Нет подрядчиков" />
        ) : (
          <Table
            dataSource={contractors}
            columns={columns}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 20 }}
          />
        )}
      </Card>

      {/* Модальное окно подрядчика */}
      <Modal
        title={editingContractor ? 'Редактирование подрядчика' : 'Новый подрядчик'}
        open={modalOpen}
        onCancel={handleModalClose}
        onOk={handleSubmit}
        confirmLoading={saveMutation.isPending}
        width={800}
      >
        <Tabs defaultActiveKey="info" items={[
          {
            key: 'info',
            label: 'Основная информация',
            children: (
              <Form form={form} layout="vertical">
                <Form.Item name="name" label="Краткое наименование" rules={[{ required: true, message: 'Введите наименование' }]}>
                  <Input placeholder="Например: ООО «Подрядчик»" />
                </Form.Item>
                <Form.Item name="full_name" label="Полное наименование">
                  <Input placeholder="Полное юридическое наименование" />
                </Form.Item>
                <Space style={{ display: 'flex' }} align="start">
                  <Form.Item name="inn" label="ИНН" style={{ width: 200 }}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="kpp" label="КПП" style={{ width: 200 }}>
                    <Input />
                  </Form.Item>
                </Space>
                <Form.Item name="specialization" label="Специализация">
                  <Input.TextArea rows={2} placeholder="Описание специализации подрядчика" />
                </Form.Item>
                <Form.Item name="legal_address" label="Юридический адрес">
                  <Input.TextArea rows={2} />
                </Form.Item>
                <Form.Item name="actual_address" label="Фактический адрес">
                  <Input.TextArea rows={2} />
                </Form.Item>
                <Space style={{ display: 'flex' }} align="start">
                  <Form.Item name="contract_number" label="Номер договора" style={{ width: 200 }}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="contract_date" label="Дата договора">
                    <DatePicker />
                  </Form.Item>
                  <Form.Item name="rating" label="Рейтинг">
                    <Rate allowHalf />
                  </Form.Item>
                </Space>
                <Form.Item name="notes" label="Примечания">
                  <Input.TextArea rows={2} />
                </Form.Item>
              </Form>
            ),
          },
          {
            key: 'contacts',
            label: `Контактные лица (${contacts.length})`,
            children: (
              <div>
                <Button 
                  type="dashed" 
                  icon={<PlusOutlined />} 
                  onClick={handleAddContact}
                  style={{ marginBottom: 16 }}
                  block
                >
                  Добавить контактное лицо
                </Button>
                
                {contacts.length === 0 ? (
                  <Empty description="Контактные лица не добавлены" />
                ) : (
                  <List
                    dataSource={contacts}
                    renderItem={(contact, index) => (
                      <List.Item
                        actions={[
                          !contact.is_primary && (
                            <Button 
                              type="link" 
                              size="small" 
                              onClick={() => handleSetPrimaryContact(index)}
                            >
                              Сделать основным
                            </Button>
                          ),
                          <Button 
                            type="link" 
                            size="small" 
                            onClick={() => handleEditContact(contact, index)}
                          >
                            Редактировать
                          </Button>,
                          <Popconfirm
                            title="Удалить контакт?"
                            onConfirm={() => handleDeleteContact(index)}
                          >
                            <Button type="link" size="small" danger>Удалить</Button>
                          </Popconfirm>,
                        ].filter(Boolean)}
                      >
                        <List.Item.Meta
                          avatar={<Avatar icon={<UserOutlined />} />}
                          title={
                            <Space>
                              {getContactFullName(contact)}
                              {contact.is_primary && (
                                <Tag color="gold" icon={<StarFilled />}>Основной</Tag>
                              )}
                            </Space>
                          }
                          description={
                            <Space split={<Divider type="vertical" />}>
                              {contact.position && <span>{contact.position}</span>}
                              {contact.phone && <span><PhoneOutlined /> {contact.phone}</span>}
                              {contact.email && <span><MailOutlined /> {contact.email}</span>}
                            </Space>
                          }
                        />
                      </List.Item>
                    )}
                  />
                )}
              </div>
            ),
          },
          {
            key: 'bank',
            label: (
              <Space>
                <BankOutlined />
                Банковские реквизиты ({bankDetails.length})
              </Space>
            ),
            children: editingContractor ? (
              <BankDetailsList
                bankDetails={bankDetails}
                contractorId={editingContractor.id}
              />
            ) : (
              <Empty 
                description="Сохраните подрядчика, чтобы добавить банковские реквизиты" 
                style={{ margin: '40px 0' }}
              />
            ),
          },
        ]} />
      </Modal>

      {/* Модальное окно контактного лица */}
      <Modal
        title={editingContact ? 'Редактирование контакта' : 'Новое контактное лицо'}
        open={contactModalOpen}
        onCancel={() => { setContactModalOpen(false); contactForm.resetFields(); }}
        onOk={handleContactSubmit}
        width={500}
      >
        <Form form={contactForm} layout="vertical">
          <Form.Item 
            name="last_name" 
            label="Фамилия" 
            rules={[{ required: true, message: 'Введите фамилию' }]}
          >
            <Input placeholder="Иванов" />
          </Form.Item>
          <Form.Item 
            name="first_name" 
            label="Имя" 
            rules={[{ required: true, message: 'Введите имя' }]}
          >
            <Input placeholder="Иван" />
          </Form.Item>
          <Form.Item name="middle_name" label="Отчество">
            <Input placeholder="Иванович" />
          </Form.Item>
          <Form.Item name="position" label="Должность">
            <Input placeholder="Например: Инженер производства" />
          </Form.Item>
          <Form.Item name="phone" label="Телефон">
            <Input placeholder="+7 (999) 123-45-67" />
          </Form.Item>
          <Form.Item name="email" label="Email">
            <Input placeholder="email@example.com" />
          </Form.Item>
          <Form.Item name="notes" label="Примечания">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
