"use client";

import * as React from "react";
import { UserCircle } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";

interface UserAvatarProps {
  avatarUrl?: string | null;
  name?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  fallbackClassName?: string;
}

const sizeClasses = {
  sm: "h-6 w-6",
  md: "h-9 w-9",
  lg: "h-16 w-16",
  xl: "h-24 w-24",
};

const iconSizes = {
  sm: 16,
  md: 20,
  lg: 32,
  xl: 40,
};

export function UserAvatar({
  avatarUrl,
  name,
  size = "md",
  className,
  fallbackClassName,
}: UserAvatarProps) {
  return (
    <Avatar className={cn(sizeClasses[size], className)}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={name || "User"} className="object-cover" />}
      <AvatarFallback
        className={cn(
          "bg-primary/10 text-primary flex items-center justify-center",
          fallbackClassName
        )}
      >
        <UserCircle size={iconSizes[size]} />
      </AvatarFallback>
    </Avatar>
  );
}

export default UserAvatar;
