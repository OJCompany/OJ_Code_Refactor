function processOrder(order: { user?: { isActive: boolean; age: number }; items: string[]; discount?: number }) {
  if (order.user) {
    if (order.user.isActive) {
      if (order.user.age >= 18) {
        if (order.items.length > 0) {
          let total = order.items.length * 10;
          if (order.discount) {
            if (order.discount > 0 && order.discount <= 100) {
              total = total * (1 - order.discount / 100);
            }
          }
          return total;
        }
      }
    }
  }
  return 0;
}

function validateSignup(email: string, password: string, age: number) {
  if (email) {
    if (email.includes('@')) {
      if (password) {
        if (password.length >= 8) {
          if (age >= 14) {
            return { valid: true };
          } else {
            return { valid: false, reason: '14세 미만' };
          }
        } else {
          return { valid: false, reason: '비밀번호 8자 이상' };
        }
      } else {
        return { valid: false, reason: '비밀번호 없음' };
      }
    } else {
      return { valid: false, reason: '이메일 형식 오류' };
    }
  } else {
    return { valid: false, reason: '이메일 없음' };
  }
}
