// 쇼핑몰 주문 처리 모듈

export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  category?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface IUser {
  id: string;
  grade: string;
}

export interface IPayment {
  method: string;
}

export interface IProductFilters {
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
}

export interface IOrder {
  orderId: string;
  user: string;
  items: CartItem[];
  total: number;
  payment: string;
  status: string;
}

export interface ICategoryGrouped {
  [key: string]: Product[];
}

export function calculateTotal(items: CartItem[]): number {
  let total: number = 0;
  for (const item of items) {
    const subtotal: number = item.product.price * item.quantity;
    total += subtotal;
  }
  return total;
}

export function applyDiscount(total: number, user: IUser): number {
  let discount: number = 0;
  if (user.grade === 'vip') {
    discount = total * 0.2;
  } else if (user.grade === 'gold') {
    discount = total * 0.1;
  } else if (user.grade === 'silver') {
    discount = total * 0.05;
  }
  return total - discount;
}

export function processOrder(cart: CartItem[], user: IUser, payment: IPayment): IOrder {
  const total = calculateTotal(cart);
  const discounted = applyDiscount(total, user);
  return {
    orderId: Math.random().toString(36).slice(2),
    user: user.id,
    items: cart,
    total: discounted,
    payment: payment.method,
    status: 'pending',
  };
}

export function filterProducts(products: Product[], filters: IProductFilters): Product[] {
  return products.filter((p: Product) => {
    if (filters.minPrice && p.price < filters.minPrice) return false;
    if (filters.maxPrice && p.price > filters.maxPrice) return false;
    if (filters.inStock && p.stock === 0) return false;
    return true;
  });
}

export function groupByCategory(products: Product[]): ICategoryGrouped {
  return products.reduce((acc: ICategoryGrouped, product: Product) => {
    const cat = product.category ?? 'uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(product);
    return acc;
  }, {});
}

export function sortByPrice(products: Product[], order: 'asc' | 'desc'): Product[] {
  return [...products].sort((a: Product, b: Product) => {
    return order === 'asc' ? a.price - b.price : b.price - a.price;
  });
}