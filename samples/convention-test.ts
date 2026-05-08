// 컨벤션 테스트용 샘플 — any 타입 다수 포함

interface RawOrder {
  id: string;
  items: any[];
  customer: any;
  payment: any;
  metadata: any;
}

function calculateTotal(items: any[]): any {
  let total: any = 0;
  for (const item of items) {
    const price: any = item.price;
    const qty: any = item.quantity ?? 1;
    total += price * qty;
  }
  return total;
}

function validateCustomer(customer: any): any {
  const errors: any[] = [];
  if (!customer.name) errors.push('이름 없음');
  if (!customer.email || !customer.email.includes('@')) errors.push('이메일 잘못됨');
  if (!customer.address) errors.push('주소 없음');
  return errors;
}

function processPayment(payment: any, amount: any): any {
  if (payment.method === 'card') {
    return { success: true, txId: payment.cardNumber + '-' + Date.now(), amount };
  }
  if (payment.method === 'transfer') {
    return { success: true, txId: payment.bankCode + '-' + Date.now(), amount };
  }
  return { success: false, error: '지원하지 않는 결제 수단' };
}

async function submitOrder(raw: any): Promise<any> {
  const total: any = calculateTotal(raw.items);
  const customerErrors: any = validateCustomer(raw.customer);

  if (customerErrors.length > 0) {
    return { ok: false, errors: customerErrors };
  }

  const paymentResult: any = processPayment(raw.payment, total);
  if (!paymentResult.success) {
    return { ok: false, errors: [paymentResult.error] };
  }

  return {
    ok: true,
    orderId: raw.id,
    total,
    txId: paymentResult.txId,
    customer: raw.customer.name,
  };
}

function formatReceipt(result: any): string {
  if (!result.ok) {
    return `주문 실패: ${result.errors.join(', ')}`;
  }
  return `주문 완료 — #${result.orderId} | ${result.customer} | ${result.total}원 | TX: ${result.txId}`;
}
