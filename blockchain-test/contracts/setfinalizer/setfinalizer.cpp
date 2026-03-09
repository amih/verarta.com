#include <eosio/eosio.hpp>
#include <eosio/instant_finality.hpp>
using namespace eosio;

class [[eosio::contract("setfinalizer")]] setfinalizer_contract : public contract {
public:
   using contract::contract;

   [[eosio::action]]
   void setfin(const eosio::finalizer_policy& finalizer_policy) {
      require_auth(get_self());
      eosio::set_finalizers(finalizer_policy);
   }
};
