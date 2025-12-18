import { md5 } from "js-md5";

export function getGravatarUrl(email: string, size: number = 80): string {
  const hash = md5(email.trim().toLowerCase());
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`;
}
