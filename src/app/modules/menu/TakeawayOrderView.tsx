import { CustomerMenuView } from './CustomerMenuView';

export function TakeawayOrderView() {
  return <CustomerMenuView initialOrderType="takeaway" lockOrderType />;
}
