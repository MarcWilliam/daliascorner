export const manualOrderCopy = {
  en: {
    reloadPrices: "Reload prices & fees",
    newPaused:
      "Some selected products are paused. Remove them for a new order, or choose Past delivered order for an earlier sale.",
    mode: "Order type",
    newMode: "New order",
    pastMode: "Past delivered order",
    pastIntro:
      "Record a delivered sale using its original dates. No delivery reservation or new-order alert is created.",
    history: "Original sale details",
    orderedOn: "Original order date (Cairo)",
    paidOn: "Original payment received date (Cairo)",
    originalDatesHint:
      "Use the dates from the original sale. The payment date determines when income appears in Finance.",
    stockHandling: "How should this past sale affect current stock?",
    accounted: "Already accounted for — keep current stock",
    deductNow: "Deduct tracked stock now — unlimited items unchanged",
    stockHint:
      "Keep current stock if these pieces were already removed from your count. Deduct now only if they are still included in current stock.",
    originalCost: "Original unit cost (optional)",
    costHint:
      "Leave blank if unknown. Enter 0 only for a known zero cost. Today's cost is never used for past sales.",
    confirmOriginal:
      "The displayed catalog prices and delivery fee match the original sale.",
    originalPriceHint:
      "Use this mode only when the displayed prices and fee match what the customer originally owed.",
    datesError:
      "Enter the original order date and, if paid, the payment date. Dates cannot be in the future; payment cannot precede the order.",
    costError:
      "Original unit costs must be blank (unknown) or non-negative amounts with at most two decimal places.",
    totalChanged:
      "The catalog total or delivery fee changed. Reload the options and confirm that the displayed total matches the original sale before retrying.",
    confirmationRequired:
      "Confirm that catalog prices and the delivery fee match the original sale.",
    pastSavedNotice:
      "This delivered chat order is recorded on its original dates. Income and known original costs appear in Finance; unknown costs remain marked as missing.",
    pastNoProducts: "No catalog products are available to record this sale.",
    pastNoDelivery:
      "Add the original sale's delivery area and fee in Delivery & payments first.",
    pastStatus:
      "Saved as delivered. No stock is reserved and no new-order alert is sent. Deducting tracked stock may trigger a low-stock alert.",
    paused: "Paused",
    title: "Add a chat order",
    intro:
      "Record an order received by message, using catalog prices and your delivery settings.",
    products: "Products",
    chooseProduct: "Choose a product",
    addProduct: "Add product",
    otherProducts: "Other products",
    quantity: "Quantity",
    remove: "Remove",
    available: "available",
    unlimited: "Unlimited stock",
    soldOut: "Sold out",
    noProducts:
      "No active products are available. Update Products & stock first.",
    addFirst: "Add at least one product to this order.",
    customer: "Customer details",
    name: "Customer name",
    phone: "Phone number",
    address: "Delivery address",
    delivery: "Delivery & payment",
    area: "Delivery area",
    chooseArea: "Choose an area",
    payment: "Payment method",
    paid: "Payment already received",
    paidHint:
      "Only select this after receiving the full order total. It records income in Finance.",
    paidStatus: "Paid",
    unpaidStatus: "Unpaid",
    tracking: "Private customer tracking link",
    trackingHint:
      "Copy this link and share it with the customer. Anyone with this link can view the order until it is saved to their account.",
    copyLink: "Copy tracking link",
    copied: "Tracking link copied",
    copyFailed: "Select and copy the tracking link above.",
    done: "Done",
    cash: "Cash on delivery",
    transfer: "Manual transfer",
    subtotal: "Items subtotal",
    fee: "Delivery",
    total: "Order total",
    selectArea: "Choose an area to see the total",
    status: "Starts confirmed and unpaid. Stock is reserved when you save.",
    statusPaid:
      "Starts confirmed and paid. Stock is reserved and the received amount is recorded in Finance.",
    save: "Save order",
    saving: "Saving order…",
    cancel: "Cancel",
    loading: "Loading delivery and payment options…",
    loadError:
      "Could not load delivery and payment options. Your entries have been kept.",
    retry: "Try again",
    noDelivery:
      "Add an active delivery area in Delivery & payments before creating an order.",
    noPayment:
      "Enable a payment method in Delivery & payments before creating an order.",
    validation:
      "Check the customer details, products, delivery area and payment method.",
    stockError:
      "There is not enough stock for this order. Update the quantities or restock the products, then retry.",
    optionsChanged:
      "A product, delivery area or payment option has changed. Review the current settings, then retry.",
    forbidden:
      "Your admin session may have expired. Sign in again before saving this order.",
    saveError:
      "We could not confirm that the order was saved. Your entries have been kept. Retry the same order to avoid a duplicate.",
    saved: "Order saved",
    savedNotice:
      "This chat order is now in Orders, with stock and finances tracked alongside website orders.",
    newOrder: "Add another order",
    viewOrder: "View order",
    refreshError:
      "The order was saved, but the list could not refresh. Refresh Orders to see it.",
    currency: "EGP",
  },
  ar: {
    reloadPrices: "تحديث الأسعار ورسوم التوصيل",
    newPaused:
      "بعض المنتجات المحددة متوقفة. احذفها للطلب الجديد، أو اختر طلبًا سابقًا تم تسليمه لتسجيل بيع قديم.",
    mode: "نوع الطلب",
    newMode: "طلب جديد",
    pastMode: "طلب سابق تم تسليمه",
    pastIntro:
      "سجّل عملية بيع تم تسليمها بتواريخها الأصلية، دون حجز توصيل أو إرسال تنبيه طلب جديد.",
    history: "تفاصيل البيع الأصلي",
    orderedOn: "تاريخ الطلب الأصلي (القاهرة)",
    paidOn: "تاريخ استلام المبلغ الأصلي (القاهرة)",
    originalDatesHint:
      "استخدم تواريخ عملية البيع الأصلية. تاريخ استلام المبلغ يحدد وقت ظهور الدخل في الحسابات.",
    stockHandling: "كيف يؤثر هذا البيع السابق على المخزون الحالي؟",
    accounted: "محسوب بالفعل — اترك المخزون الحالي كما هو",
    deductNow: "اخصم المخزون المتتبع الآن — غير المحدود لا يتغير",
    stockHint:
      "اترك المخزون كما هو إذا كانت القطع خُصمت من العدد بالفعل. اختر الخصم الآن فقط إذا كانت ما زالت ضمن العدد الحالي.",
    originalCost: "تكلفة القطعة الأصلية (اختياري)",
    costHint:
      "اتركها فارغة إذا كانت غير معروفة. أدخل ٠ فقط إذا كانت التكلفة الأصلية صفرًا فعلًا. لا تُستخدم تكلفة اليوم للطلبات السابقة.",
    confirmOriginal:
      "أسعار المنتجات ورسوم التوصيل المعروضة تطابق عملية البيع الأصلية.",
    originalPriceHint:
      "استخدم هذا الوضع فقط عندما تطابق الأسعار والرسوم المعروضة ما كان مستحقًا على العميل وقت البيع.",
    datesError:
      "أدخل تاريخ الطلب الأصلي وتاريخ استلام المبلغ إن كان مدفوعًا. لا يمكن اختيار تاريخ مستقبلي أو تاريخ دفع يسبق الطلب.",
    costError:
      "اترك التكلفة الأصلية فارغة إن لم تكن معروفة، أو أدخل مبلغًا غير سالب بخانتين عشريتين كحد أقصى.",
    totalChanged:
      "تغير إجمالي المنتجات أو رسوم التوصيل. حدّث الخيارات وتأكد من مطابقة الإجمالي المعروض للبيع الأصلي قبل المحاولة مجددًا.",
    confirmationRequired:
      "أكد أن أسعار المنتجات ورسوم التوصيل تطابق البيع الأصلي.",
    pastSavedNotice:
      "سُجّل طلب المحادثة كطلب سابق تم تسليمه بتواريخه الأصلية. يظهر الدخل والتكلفة الأصلية المعروفة في الحسابات، وتظل التكاليف المجهولة موضحة كبيانات ناقصة.",
    pastNoProducts: "لا توجد منتجات في الكتالوج لتسجيل عملية البيع.",
    pastNoDelivery:
      "أضف منطقة التوصيل ورسوم البيع الأصلي في التوصيل والدفع أولًا.",
    pastStatus:
      "يُحفظ كطلب تم تسليمه دون حجز مخزون أو تنبيه طلب جديد. قد يرسل خصم المخزون المتتبع تنبيه انخفاض المخزون.",
    paused: "متوقف",
    title: "إضافة طلب من المحادثات",
    intro:
      "سجّل طلبًا وصلك برسالة، بأسعار المنتجات ورسوم التوصيل المحددة في المتجر.",
    products: "المنتجات",
    chooseProduct: "اختر منتجًا",
    addProduct: "إضافة المنتج",
    otherProducts: "منتجات أخرى",
    quantity: "الكمية",
    remove: "إزالة",
    available: "متاح",
    unlimited: "مخزون غير محدود",
    soldOut: "نفد المخزون",
    noProducts: "لا توجد منتجات متاحة ومفعّلة. حدّث المنتجات والمخزون أولًا.",
    addFirst: "أضف منتجًا واحدًا على الأقل إلى الطلب.",
    customer: "بيانات العميل",
    name: "اسم العميل",
    phone: "رقم الهاتف",
    address: "عنوان التوصيل",
    delivery: "التوصيل والدفع",
    area: "منطقة التوصيل",
    chooseArea: "اختر المنطقة",
    payment: "طريقة الدفع",
    paid: "تم استلام المبلغ بالفعل",
    paidHint:
      "اختر هذا فقط بعد استلام إجمالي الطلب كاملًا. يُسجّل المبلغ كدخل في الحسابات.",
    paidStatus: "مدفوع",
    unpaidStatus: "غير مدفوع",
    tracking: "رابط متابعة خاص بالعميل",
    trackingHint:
      "انسخ الرابط وشاركه مع العميل. يمكن لمن يملك الرابط عرض الطلب إلى أن يُحفظ في حساب العميل.",
    copyLink: "نسخ رابط المتابعة",
    copied: "تم نسخ رابط المتابعة",
    copyFailed: "حدد رابط المتابعة أعلاه وانسخه.",
    done: "تم",
    cash: "الدفع عند الاستلام",
    transfer: "تحويل يدوي",
    subtotal: "قيمة المنتجات",
    fee: "التوصيل",
    total: "إجمالي الطلب",
    selectArea: "اختر المنطقة لعرض الإجمالي",
    status: "يُضاف الطلب بحالة مؤكد وغير مدفوع، وتُحجز القطع عند الحفظ.",
    statusPaid:
      "يُضاف الطلب بحالة مؤكد ومدفوع، مع حجز القطع وتسجيل المبلغ المستلم في الحسابات.",
    save: "حفظ الطلب",
    saving: "جارٍ حفظ الطلب…",
    cancel: "إلغاء",
    loading: "جارٍ تحميل خيارات التوصيل والدفع…",
    loadError:
      "تعذر تحميل خيارات التوصيل والدفع. احتفظنا بالبيانات التي أدخلتها.",
    retry: "حاول مرة أخرى",
    noDelivery: "أضف منطقة توصيل مفعّلة في التوصيل والدفع قبل إنشاء الطلب.",
    noPayment: "فعّل طريقة دفع في التوصيل والدفع قبل إنشاء الطلب.",
    validation: "راجع بيانات العميل والمنتجات ومنطقة التوصيل وطريقة الدفع.",
    stockError:
      "المخزون لا يكفي لهذا الطلب. عدّل الكميات أو أضف مخزونًا، ثم حاول مجددًا.",
    optionsChanged:
      "تغير أحد المنتجات أو خيارات التوصيل أو الدفع. راجع الإعدادات الحالية ثم حاول مجددًا.",
    forbidden: "قد تكون جلسة المدير انتهت. سجّل الدخول مجددًا قبل حفظ الطلب.",
    saveError:
      "تعذر التأكد من حفظ الطلب. احتفظنا بالبيانات. أعد محاولة حفظ نفس الطلب لتجنب تكراره.",
    saved: "تم حفظ الطلب",
    savedNotice:
      "ظهر طلب المحادثة في الطلبات، مع متابعة المخزون والحسابات مثل طلبات الموقع.",
    newOrder: "إضافة طلب آخر",
    viewOrder: "عرض الطلب",
    refreshError: "تم حفظ الطلب لكن تعذر تحديث القائمة. حدّث الطلبات لعرضه.",
    currency: "جنيه",
  },
};
