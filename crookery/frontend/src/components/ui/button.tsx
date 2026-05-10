import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost" | "outline" | "destructive";
  size?: "sm" | "md" | "icon";
}

export function Button({ className, variant = "default", size = "md", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
        variant === "default" && "bg-primary text-primary-foreground hover:opacity-90",
        variant === "ghost" && "hover:bg-accent/10 text-foreground",
        variant === "outline" && "border border-border hover:bg-accent/10 text-foreground",
        variant === "destructive" && "bg-destructive text-destructive-foreground hover:opacity-90",
        size === "sm" && "h-7 px-3 text-xs",
        size === "md" && "h-9 px-4 text-sm",
        size === "icon" && "h-9 w-9",
        className,
      )}
      {...props}
    />
  );
}
