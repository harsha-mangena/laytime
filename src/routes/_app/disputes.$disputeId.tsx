import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { money, shortDate } from "@/lib/format";
import { useLaytime } from "@/lib/store";

export const Route = createFileRoute("/_app/disputes/$disputeId")({
  component: DisputeDetail,
});

function DisputeDetail() {
  const { disputeId } = Route.useParams();
  const dispute = useLaytime((s) => s.disputes.find((d) => d.id === disputeId));
  const invoice = useLaytime((s) => s.invoices.find((i) => i.id === dispute?.invoiceId));
  const markSent = useLaytime((s) => s.markDisputeSent);
  const markRecovered = useLaytime((s) => s.markRecovered);

  if (!dispute) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        Pack not found.
        <div className="mt-4">
          <Button asChild variant="secondary">
            <Link to="/disputes">All packs</Link>
          </Button>
        </div>
      </div>
    );
  }

  const pack = dispute;
  const letter = pack.letter;
  const packId = pack.id;

  async function copyLetter() {
    await navigator.clipboard.writeText(letter);
    toast("Letter copied.");
  }

  function downloadLetter() {
    const blob = new Blob([letter], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${packId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to="/disputes"
          className="inline-flex h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Packs
        </Link>
        <h1 className="mt-2 font-mono text-2xl">{pack.id}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {invoice ? `${invoice.invoiceNumber} · {money(invoice.amountDue)}` : pack.invoiceId} ·
          deadline {shortDate(pack.deadline)}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={copyLetter}>Copy letter</Button>
        <Button variant="secondary" onClick={downloadLetter}>
          Download
        </Button>
        {pack.status === "draft" ? (
          <Button
            variant="outline"
            onClick={() => {
              markSent(packId);
              toast("Marked sent. 541.8(b) resolution clock starts on the carrier.");
            }}
          >
            Mark sent
          </Button>
        ) : null}
        {pack.status !== "accepted" && invoice ? (
          <Button
            variant="outline"
            onClick={() => {
              markRecovered(invoice.id);
              toast("Carrier waived. Amount recovered.");
            }}
          >
            Mark recovered
          </Button>
        ) : null}
        {invoice ? (
          <Button asChild variant="ghost">
            <Link to="/invoices/$invoiceId" params={{ invoiceId: invoice.id }}>
              Invoice
            </Link>
          </Button>
        ) : null}
      </div>

      <article className="paper-doc rounded-xl p-6 font-mono text-xs leading-relaxed whitespace-pre-wrap sm:p-8">
        {letter}
      </article>
    </div>
  );
}
