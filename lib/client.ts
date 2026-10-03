export async function api<T>(url:string, options?:RequestInit):Promise<T> {
  const response=await fetch(url,{cache:'no-store',...options,headers:{'Content-Type':'application/json',...options?.headers}});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'SERVER_ERROR');return data as T;
}
export function errorCopy(error:unknown, t:(zh:string,en:string)=>string){
  const code=error instanceof Error?error.message:'';
  const messages:Record<string,[string,string]>={
    INVALID_EMAIL:['请输入有效的邮箱地址。','Please enter a valid email address.'],
    INVALID_TEXT:['请检查内容长度，填写完整的问题和标题。','Check the length of your subject and message.'],
    ORDER_MISMATCH:['邮箱或订单号不匹配，请检查后重试。','That email and order reference do not match.'],
    NOT_FOUND:['找不到该记录，请检查你的专属链接。','Record not found. Please check your private link.'],
    INVALID_STATE:['此订单状态不支持该操作。','This action is not available for this order.'],
    ORDER_EXPIRED:['该待付款订单已过期，请重新选择方案。','This pending order has expired. Please choose your package again.'],
    TICKET_CLOSED:['此工单已关闭。如需帮助，请创建新工单。','This ticket is closed. Please open a new ticket if you need help.'],
    UNAUTHORIZED:['密码不正确，或登录已过期。','Incorrect password, or your session has expired.'],
    RATE_LIMITED:['操作过于频繁，请一分钟后再试。','Too many attempts. Please try again in one minute.'],
    LOCAL_ONLY:['此功能仅在本地测试模式可用。','This feature is available only in local test mode.'],
    CHECKOUT_UNAVAILABLE:['此方案暂时无法购买，请稍后再试。','This package is temporarily unavailable. Please try again later.'],
  };
  return messages[code]?t(...messages[code]):t('暂时无法完成操作，请重试。','Something went wrong. Please try again.');
}
