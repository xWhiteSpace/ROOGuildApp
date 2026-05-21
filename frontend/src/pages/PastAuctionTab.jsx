export default function PastAuctionTab() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl">
        <h2 className="text-2xl font-semibold text-white">Past Auction</h2>
        <p className="mt-2 text-slate-400">Review completed auctions and auctioned item history.</p>
      </div>
      <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-lg">
        <div className="text-slate-400">Past auction summaries will display here.</div>
      </div>
    </div>
  );
}
