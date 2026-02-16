import dayjs from 'dayjs';
import * as XLSX from 'xlsx';

export interface OrderExportItem {
  index: number;
  nomenclatureName: string;
  projectName?: string;
  quantity: number;
  unit?: string;
  orderByDate?: string | null;
}

interface ExportOrderOptions {
  fileName: string;
  orderNumber?: string | null;
  supplierName?: string | null;
  supplierInn?: string | null;
  orderDate?: string | null;
  items: OrderExportItem[];
}

const formatDate = (value?: string | null) => {
  if (!value) return '';
  const d = dayjs(value);
  return d.isValid() ? d.format('DD.MM.YYYY') : value;
};

export const exportOrderToExcel = ({
  fileName,
  orderNumber,
  supplierName,
  supplierInn,
  orderDate,
  items,
}: ExportOrderOptions) => {
  const headerRows: (string | number)[][] = [
    ['Заказ', orderNumber || '—'],
    ['Поставщик', supplierName || '—'],
    ['ИНН поставщика', supplierInn || '—'],
    ['Дата заказа', formatDate(orderDate)],
    [],
    ['№', 'Наименование', 'Проект', 'Кол-во', 'Ед.', 'Заказать до'],
  ];

  const dataRows = items.map((item) => [
    item.index,
    item.nomenclatureName,
    item.projectName || '—',
    item.quantity,
    item.unit || '',
    formatDate(item.orderByDate || null),
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet([...headerRows, ...dataRows]);
  worksheet['!cols'] = [
    { wch: 5 },
    { wch: 40 },
    { wch: 20 },
    { wch: 10 },
    { wch: 8 },
    { wch: 14 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Заказ');

  const safeName = fileName.replace(/[\\/:*?"<>|]+/g, '_');
  XLSX.writeFile(workbook, safeName.endsWith('.xlsx') ? safeName : `${safeName}.xlsx`);
};
