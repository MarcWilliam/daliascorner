export const expenseCategories = [
  "inventory",
  "marketing",
  "shipping",
  "packaging",
  "overhead",
  "other",
] as const;
export type ExpenseCategory = (typeof expenseCategories)[number];
export type FinanceOverview = {
  collected: number;
  refunded: number;
  corrections: number;
  net_collected: number;
  items_collected: number;
  delivery_collected: number;
  cash_spent: number;
  inventory_spent: number;
  operating_spent: number;
  known_product_cost: number;
  missing_cost_items: number;
  cash_balance: number;
  gross_profit: number | null;
  operating_result: number | null;
  gross_margin: number | null;
  operating_margin: number | null;
  opening_paid_orders: number;
  opening_paid_amount: number;
  tracking_started_at?: string;
  untracked_refunded_orders?: number;
  categories: { category: ExpenseCategory; amount: number }[];
};
export const financeCopy = {
  en: {
    title: "Financial report",
    intro:
      "Compare recorded cash receipts, product costs and business expenses.",
    from: "From",
    to: "To",
    apply: "Apply dates",
    allTime: "All time",
    presets: "Report period",
    today: "Today",
    thisMonth: "This month",
    lastMonth: "Last month",
    refresh: "Refresh",
    period: "Cairo time · Custom dates apply to the summary.",
    loading: "Loading finances…",
    loadError: "Unable to load finances. Please try again.",
    saveError: "Unable to save. Your entries have been kept; try again.",
    saved: "Saved.",
    savedRefresh: "Saved. Refresh to load the latest totals.",
    saving: "Saving…",
    netCollected: "Net money collected",
    receiptsHint:
      "Payments less refunds and payment corrections; includes delivery fees.",
    spent: "Cash spent",
    spentHint: "All recorded expenses, including stock purchases.",
    cashBalance: "Tracked cash balance",
    cashHint:
      "Net money collected minus cash spent. This is not your bank balance.",
    operatingResult: "Profit estimate",
    operatingHint: "Net collected minus product costs and operating expenses.",
    margin: "Estimated margin",
    incomplete: "Incomplete",
    missing:
      "Some recognized product costs are missing. Complete the original unit costs below to calculate profit and margins.",
    addExpense: "Record an expense",
    expenseIntro:
      "Log money you have actually paid. Stock purchases affect cash; product costs follow the order’s costing policy.",
    amount: "Amount (EGP)",
    category: "Category",
    date: "Date paid",
    note: "Note (optional)",
    add: "Save expense",
    notePlaceholder: "For example, delivery invoice or ad campaign",
    categories: {
      inventory: "Stock purchases",
      marketing: "Advertising & marketing",
      shipping: "Delivery & shipping",
      packaging: "Packaging",
      overhead: "Rent, utilities & overhead",
      other: "Other business expenses",
    },
    breakdown: "How the estimate is calculated",
    netItems: "Net product receipts",
    netDelivery: "Net delivery fees collected",
    payments: "Payments recorded",
    refunds: "Refunds recorded",
    corrections: "Paid-status corrections",
    productCosts: "Recognized product costs",
    operating: "Operating expenses",
    gross: "Gross profit estimate",
    grossMargin: "Gross margin",
    purchases: "Stock purchases (cash only)",
    trackingSince: "Payment-event tracking started",
    legacyRefunds:
      "Refunds that predate tracking are excluded because their original payment and refund dates are unknown:",
    methodology:
      "Managed orders recognize product costs when items ship, reversing them only for explicitly restocked returns. Receipts and refunds use their recorded effective Cairo dates, including partial amounts. Legacy cost movements remain at their original dates; promotion records a costing-policy adjustment without inventing cash. Cash balance is not a bank balance, and this management estimate is not a tax or accrual report.",
    history: "Recent expenses",
    emptyExpenses: "No expenses recorded yet.",
    void: "Void entry",
    voidConfirm:
      "Void this expense? It will remain in the history and stop affecting totals.",
    voided: "Voided",
    entriesHint:
      "Showing up to 100 latest entries across all dates. The totals above use your selected dates.",
    missingTitle: "Complete missing product costs",
    missingHint:
      "Enter the original cost per unit for this order, not today’s selling price. Saved historical costs cannot be changed here. Set costs for future orders in Products & stock.",
    unitCost: "Unit cost (EGP)",
    saveCost: "Save cost",
    quantity: "Qty",
    missingLimit:
      "Showing up to 100 missing recognized costs, across all dates.",
    recentPayments: "Recent payments & refunds",
    emptyPayments: "No payment activity recorded yet.",
    payment: "Payment",
    refund: "Refund",
    correction: "Correction",
    opening_paid: "Opening paid balance",
    order: "Order",
    undated: "Date unknown",
    activityHint:
      "Showing up to 30 latest payment records across all dates. Mark payments and full refunds from Orders.",
    opening:
      "Earlier paid orders were imported without a verified payment date. Their opening balance is included only in All time; historical costs must be entered separately.",
    invalidDates: "The end date must be on or after the start date.",
    invalidAmount: "Enter a valid amount with no more than two decimal places.",
    costLocked:
      "This cost has already been saved. Refresh to see the latest information.",
  },
  ar: {
    title: "التقرير المالي",
    intro: "قارن المقبوضات وتكاليف المنتجات ومصروفات المشروع.",
    from: "من",
    to: "إلى",
    apply: "تطبيق الفترة",
    allTime: "كل الفترات",
    presets: "فترة التقرير",
    today: "اليوم",
    thisMonth: "هذا الشهر",
    lastMonth: "الشهر الماضي",
    refresh: "تحديث",
    period: "بتوقيت القاهرة · التواريخ المخصصة تُطبق على الملخص.",
    loading: "جارٍ تحميل الماليات…",
    loadError: "تعذر تحميل الماليات. حاول مرة أخرى.",
    saveError: "تعذر الحفظ. تم الاحتفاظ ببياناتك، حاول مرة أخرى.",
    saved: "تم الحفظ.",
    savedRefresh: "تم الحفظ. حدّث الصفحة لعرض الإجماليات الجديدة.",
    saving: "جارٍ الحفظ…",
    netCollected: "صافي المقبوضات",
    receiptsHint:
      "المدفوعات بعد خصم الاستردادات وتصحيحات الدفع، وتشمل رسوم التوصيل.",
    spent: "المصروفات النقدية",
    spentHint: "جميع المصروفات المسجلة، بما فيها شراء المخزون.",
    cashBalance: "الرصيد النقدي المسجل",
    cashHint: "صافي المقبوضات ناقص المصروفات المسجلة. لا يمثل رصيد البنك.",
    operatingResult: "تقدير الربح",
    operatingHint: "صافي المقبوضات ناقص تكلفة المنتجات ومصروفات التشغيل.",
    margin: "هامش الربح التقديري",
    incomplete: "غير مكتمل",
    missing:
      "بعض تكاليف المنتجات المحتسبة غير مسجلة. أكمل التكلفة الأصلية أدناه لحساب الربح والهامش.",
    addExpense: "تسجيل مصروف",
    expenseIntro:
      "سجّل المبالغ التي دفعتها فعلًا. شراء المخزون يؤثر على النقدية، وتُحسب تكلفة المنتجات وفق سياسة تكلفة الطلب.",
    amount: "المبلغ (جنيه)",
    category: "الفئة",
    date: "تاريخ الدفع",
    note: "ملاحظة (اختياري)",
    add: "حفظ المصروف",
    notePlaceholder: "مثلاً فاتورة شحن أو حملة إعلانية",
    categories: {
      inventory: "شراء المخزون",
      marketing: "الإعلانات والتسويق",
      shipping: "التوصيل والشحن",
      packaging: "التغليف",
      overhead: "الإيجار والمرافق والتشغيل",
      other: "مصروفات أخرى",
    },
    breakdown: "طريقة حساب التقدير",
    netItems: "صافي مقبوضات المنتجات",
    netDelivery: "صافي رسوم التوصيل المقبوضة",
    payments: "المدفوعات المسجلة",
    refunds: "الاستردادات المسجلة",
    corrections: "تصحيحات حالة الدفع",
    productCosts: "تكلفة المنتجات المحتسبة",
    operating: "مصروفات التشغيل",
    gross: "تقدير مجمل الربح",
    grossMargin: "هامش مجمل الربح",
    purchases: "شراء المخزون (نقدية فقط)",
    trackingSince: "بدأ تسجيل حركات الدفع في",
    legacyRefunds:
      "استردادات سابقة غير محسوبة لعدم معرفة تاريخ الدفع والاسترداد الأصلي:",
    methodology:
      "تُحتسب تكلفة المنتجات للطلبات المُدارة عند الشحن، وتُعكس فقط للمرتجعات التي أُعيدت للمخزون صراحةً. تُستخدم تواريخ المقبوضات والاستردادات المسجلة بتوقيت القاهرة، بما فيها المبالغ الجزئية. تبقى حركات التكلفة السابقة في تواريخها الأصلية، ويُسجل التحويل تصحيح سياسة التكلفة دون إنشاء حركة نقدية. الرصيد المتتبع ليس رصيد البنك، وهذا تقدير إداري وليس تقريرًا ضريبيًا أو على أساس الاستحقاق.",
    history: "المصروفات الأخيرة",
    emptyExpenses: "لم تُسجّل مصروفات بعد.",
    void: "إلغاء القيد",
    voidConfirm: "إلغاء هذا المصروف؟ سيظل في السجل ولن يؤثر على الإجماليات.",
    voided: "ملغى",
    entriesHint:
      "آخر ١٠٠ قيد بحد أقصى من كل الفترات. الإجماليات أعلاه حسب التواريخ المحددة.",
    missingTitle: "إكمال تكاليف المنتجات الناقصة",
    missingHint:
      "أدخل التكلفة الأصلية للوحدة في هذا الطلب، وليس سعر البيع الحالي. لا يمكن تعديل التكلفة التاريخية بعد حفظها هنا. حدّد تكلفة الطلبات القادمة في المنتجات والمخزون.",
    unitCost: "تكلفة الوحدة (جنيه)",
    saveCost: "حفظ التكلفة",
    quantity: "الكمية",
    missingLimit: "عرض حتى ١٠٠ تكلفة محتسبة ناقصة عبر كل الفترات.",
    recentPayments: "المدفوعات والاستردادات الأخيرة",
    emptyPayments: "لم تُسجّل حركة دفع بعد.",
    payment: "دفعة",
    refund: "استرداد",
    correction: "تصحيح",
    opening_paid: "رصيد مدفوع سابق",
    order: "طلب",
    undated: "التاريخ غير معروف",
    activityHint:
      "آخر ٣٠ حركة دفع من كل الفترات. سجّل الدفعات والاستردادات الكاملة من الطلبات.",
    opening:
      "تم استيراد طلبات مدفوعة سابقة دون تاريخ دفع مؤكد. يظهر رصيدها فقط عند عرض كل الفترات، ويجب إدخال تكلفتها التاريخية بشكل منفصل.",
    invalidDates: "يجب أن يكون تاريخ النهاية في نفس تاريخ البداية أو بعده.",
    invalidAmount: "أدخل مبلغاً صحيحاً بمنزلتين عشريتين كحد أقصى.",
    costLocked: "تم حفظ هذه التكلفة بالفعل. حدّث الصفحة لعرض أحدث البيانات.",
  },
};
