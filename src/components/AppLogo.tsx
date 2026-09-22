import { useState } from "react";
import CirclelinkMark from "@/components/CirclelinkMark";
import { cn } from "@/lib/utils";

interface AppLogoProps {
  /** Eigen logo uit de huisstijlinstelling; heeft voorrang. */
  url?: string;
  alt: string;
  className?: string;
}

/**
 * Het logo in de kop.
 *
 * Standaard het beeldmerk van Circlelink, dat als component meekomt met de code.
 * Is er in de huisstijl een eigen logo ingesteld, dan wint dat; laadt dat niet
 * (verkeerde URL, server offline), dan valt de kop terug op het merk in plaats
 * van op een kapot plaatje.
 */
const AppLogo = ({ url, alt, className }: AppLogoProps) => {
  const [failed, setFailed] = useState(false);

  if (url && !failed) {
    return (
      <img
        src={url}
        alt={alt}
        onError={() => setFailed(true)}
        className={cn("rounded-2xl object-contain", className)}
      />
    );
  }

  return <CirclelinkMark title={alt} className={cn("object-contain", className)} />;
};

export default AppLogo;
