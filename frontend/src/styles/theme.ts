import type { ThemeConfig } from 'antd';

/**
 * Ant Design Theme Configuration
 * 
 * Enterprise-grade theme for data-heavy interfaces.
 * Optimized for long working sessions (6-8 hours).
 */
export const theme: ThemeConfig = {
  token: {
    // Primary colors
    colorPrimary: '#1890ff',
    colorSuccess: '#52c41a',
    colorWarning: '#faad14',
    colorError: '#ff4d4f',
    colorInfo: '#1890ff',

    // Text colors
    colorText: '#262626',
    colorTextSecondary: '#595959',
    colorTextTertiary: '#8c8c8c',
    colorTextDisabled: '#bfbfbf',

    // Background colors
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgLayout: '#f5f5f5',

    // Border colors
    colorBorder: '#d9d9d9',
    colorBorderSecondary: '#f0f0f0',

    // Typography
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: 14,
    fontSizeSM: 13,
    fontSizeLG: 16,
    fontSizeHeading1: 30,
    fontSizeHeading2: 24,
    fontSizeHeading3: 20,
    fontSizeHeading4: 16,
    fontSizeHeading5: 14,

    // Layout
    borderRadius: 6,
    borderRadiusSM: 4,
    borderRadiusLG: 8,

    // Spacing
    padding: 16,
    paddingSM: 12,
    paddingLG: 24,
    paddingXS: 8,
    margin: 16,
    marginSM: 12,
    marginLG: 24,
    marginXS: 8,

    // Control sizes (compact for data-heavy interfaces)
    controlHeight: 32,
    controlHeightSM: 24,
    controlHeightLG: 40,

    // Box shadows
    boxShadow: '0 2px 8px 0 rgba(0, 0, 0, 0.08)',
    boxShadowSecondary: '0 4px 16px 0 rgba(0, 0, 0, 0.12)',
  },
  components: {
    // Table - high density for data viewing
    Table: {
      cellPaddingBlock: 8,
      cellPaddingInline: 12,
      headerBg: '#fafafa',
      headerColor: '#262626',
      headerSortActiveBg: '#f0f0f0',
      headerSortHoverBg: '#f0f0f0',
      rowHoverBg: '#f5f5f5',
      rowSelectedBg: '#e6f4ff',
      rowSelectedHoverBg: '#bae0ff',
      borderColor: '#f0f0f0',
    },
    // Menu - sidebar navigation
    Menu: {
      itemHeight: 40,
      subMenuItemBg: 'transparent',
      itemBg: 'transparent',
      itemSelectedBg: '#e6f4ff',
      itemHoverBg: '#f5f5f5',
      itemActiveBg: '#e6f4ff',
    },
    // Card - containers
    Card: {
      paddingLG: 20,
      headerBg: 'transparent',
    },
    // Layout
    Layout: {
      headerBg: '#ffffff',
      siderBg: '#ffffff',
      bodyBg: '#f5f5f5',
    },
    // Form - compact for dense forms
    Form: {
      itemMarginBottom: 16,
    },
    // Input
    Input: {
      paddingBlock: 4,
      paddingInline: 11,
    },
    // Select
    Select: {
      optionSelectedBg: '#e6f4ff',
    },
    // Button
    Button: {
      paddingBlock: 4,
      paddingInline: 15,
    },
    // Breadcrumb
    Breadcrumb: {
      itemColor: '#8c8c8c',
      lastItemColor: '#262626',
      linkColor: '#1890ff',
      linkHoverColor: '#40a9ff',
    },
    // Tabs
    Tabs: {
      itemSelectedColor: '#1890ff',
      itemHoverColor: '#40a9ff',
      itemActiveColor: '#096dd9',
      titleFontSize: 14,
    },
    // Modal
    Modal: {
      titleFontSize: 16,
      headerBg: '#ffffff',
      contentBg: '#ffffff',
    },
    // Message & Notification
    Message: {
      contentBg: '#ffffff',
    },
    Notification: {
      width: 384,
    },
    // Badge
    Badge: {
      statusSize: 6,
    },
    // Tag
    Tag: {
      defaultBg: '#fafafa',
    },
    // Progress
    Progress: {
      defaultColor: '#1890ff',
    },
    // Statistic
    Statistic: {
      titleFontSize: 14,
      contentFontSize: 24,
    },
  },
};

/**
 * Status colors mapping
 */
export const statusColors = {
  // Manufacturing statuses
  not_started: '#8c8c8c',
  in_progress: '#1890ff',
  completed: '#52c41a',
  suspended: '#faad14',
  waiting_materials: '#fa8c16',
  quality_check: '#722ed1',
  rejected: '#ff4d4f',

  // Purchase statuses
  not_required: '#d9d9d9',
  pending: '#8c8c8c',
  ordered: '#1890ff',
  in_transit: '#13c2c2',
  delivered: '#52c41a',
  delayed: '#ff4d4f',
  partially_delivered: '#faad14',
  cancelled: '#595959',

  // Project statuses
  draft: '#8c8c8c',
  planning: '#1890ff',
  on_hold: '#faad14',
} as const;

/**
 * Chart colors palette
 */
export const chartColors = [
  '#1890ff',
  '#52c41a',
  '#faad14',
  '#722ed1',
  '#13c2c2',
  '#eb2f96',
  '#fa8c16',
  '#2f54eb',
  '#a0d911',
  '#fa541c',
];
