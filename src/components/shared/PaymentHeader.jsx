import { useSession } from "../../hooks/use-session.js";
import Nounsies from "./Nounsies.jsx";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@nextui-org/react";
import { useSetAtom } from "jotai";
import { isCreateLinkDialogAtom } from "../../store/dialog-store.js";
import { Icons } from "./Icons.jsx";
import { useAppWallet } from "../../hooks/useAppWallet.js";
import { MONAD_LOGO_ICON } from "../../config.js";

export default function PaymentHeader() {
  const { isSignedIn } = useSession();
  const setCreateLinkModal = useSetAtom(isCreateLinkDialogAtom);
  const navigate = useNavigate();

  return (
    <nav className="fixed top-0 z-50 flex items-center px-5 md:px-12 h-20 justify-between w-full bg-white/95 backdrop-blur-sm border-b border-gray-200/50">
      <div className="flex flex-row items-center gap-12">
        <Link to={"/"} className="flex items-center gap-2 min-w-[7rem]">
          <img
            src={MONAD_LOGO_ICON}
            alt="Monad"
            className="h-8 w-auto object-contain rounded-full"
          />
          <h1 className="font-bold text-xl text-gray-900">PrivatePay</h1>
        </Link>
      </div>

      <div className="flex gap-4 items-center justify-center">
        <Button
          onClick={() => {
            if (isSignedIn) {
              setCreateLinkModal(true);
            } else {
              navigate("/");
            }
          }}
          className={"bg-primary h-12 rounded-[24px] px-4"}
        >
          <Icons.link className="text-white" />
          <h1 className={"text-sm font-medium text-white"}>
            {isSignedIn ? "Create Link" : "Create your PrivatePay Link"}
          </h1>
        </Button>

        {isSignedIn && <UserProfileButton />}
      </div>
    </nav>
  );
}

const UserProfileButton = () => {
  const { account, connect } = useAppWallet();

  return (
    <div className={"flex flex-col"}>
      <button
        onClick={connect}
        className="size-12 rounded-full overflow-hidden relative border-[4px] border-[#563EEA] flex items-center justify-center bg-gray-100"
      >
        {account ? (
          <Nounsies address={account} />
        ) : (
          <img
            src="/assets/nouns-placeholder.png"
            alt="Profile"
            className="w-full h-full object-cover"
          />
        )}
      </button>
    </div>
  );
};
